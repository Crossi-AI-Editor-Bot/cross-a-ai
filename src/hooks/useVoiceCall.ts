import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type VoiceCallState = 'idle' | 'connecting' | 'listening' | 'processing' | 'speaking' | 'error';

export interface CallMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface UseVoiceCallOptions {
  onCreditsUpdate?: (credits: number) => void;
  
  modelCostId?: string;
  conversationId?: string | null;
}

export const useVoiceCall = (options?: UseVoiceCallOptions) => {
  const [state, setState] = useState<VoiceCallState>('idle');
  const [partialTranscript, setPartialTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [callMessages, setCallMessages] = useState<CallMessage[]>([]);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const commitNextChunkRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const conversationIdRef = useRef<string | null>(options?.conversationId || null);
  const callMessagesRef = useRef<CallMessage[]>([]);
  const lastModelLabelRef = useRef<string | undefined>(undefined);
  const retryCountRef = useRef(0);
  const maxRetries = 3;
  
  const { toast } = useToast();

  const getScribeToken = async (): Promise<string> => {
    const { data, error } = await supabase.functions.invoke('elevenlabs-token');
    if (error || !data?.token) {
      throw new Error('Failed to get transcription token');
    }
    return data.token;
  };

  // Load existing messages for a conversation
  const loadConversationMessages = async (convId: string) => {
    const { data } = await supabase
      .from('messages')
      .select('role, content')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true });
    
    if (data) {
      const msgs = data.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
      setCallMessages(msgs);
      callMessagesRef.current = msgs;
    }
  };

  // Create or reuse a call conversation
  const ensureConversation = async (modelLabel?: string): Promise<string> => {
    if (conversationIdRef.current) {
      await loadConversationMessages(conversationIdRef.current);
      return conversationIdRef.current;
    }
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    const title = `📞 ${modelLabel || 'Voice Call'}`;
    const { data, error } = await supabase
      .from('conversations')
      .insert({ user_id: session.user.id, title })
      .select('id')
      .single();
    
    if (error || !data) throw new Error('Failed to create call conversation');
    conversationIdRef.current = data.id;
    return data.id;
  };

  // Save a message to the database
  const saveMessage = async (role: 'user' | 'assistant', content: string) => {
    if (!conversationIdRef.current) return;
    
    await supabase.from('messages').insert({
      conversation_id: conversationIdRef.current,
      role,
      content,
    });

    const newMsg: CallMessage = { role, content };
    callMessagesRef.current = [...callMessagesRef.current, newMsg];
    setCallMessages([...callMessagesRef.current]);
  };

  const playBrowserTTS = (text: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1;
      utterance.pitch = 1;
      utterance.volume = 1;
      
      utterance.onend = () => resolve();
      utterance.onerror = (event) => reject(new Error(`Speech synthesis error: ${event.error}`));
      
      window.speechSynthesis.speak(utterance);
    });
  };

  const playTTS = async (text: string): Promise<void> => {
    setState('speaking');
    
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ text }),
        }
      );

      if (!response.ok) {
        throw new Error('TTS request failed');
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      
      if (audioRef.current) {
        audioRef.current.pause();
      }
      
      audioRef.current = new Audio(audioUrl);
      
      await new Promise<void>((resolve, reject) => {
        if (!audioRef.current) return reject(new Error('No audio element'));
        
        audioRef.current.onended = () => {
          URL.revokeObjectURL(audioUrl);
          resolve();
        };
        audioRef.current.onerror = () => {
          URL.revokeObjectURL(audioUrl);
          reject(new Error('Audio playback failed'));
        };
        audioRef.current.play().catch(reject);
      });
    } catch (err) {
      console.error('ElevenLabs TTS error, falling back to browser TTS:', err);
      try {
        await playBrowserTTS(text);
      } catch (fallbackErr) {
        console.error('Browser TTS error:', fallbackErr);
        throw fallbackErr;
      }
    }
  };

  const sendToAI = async (transcript: string): Promise<string> => {
    setState('processing');
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/voice-chat`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ 
          message: transcript,
          modelCostId: options?.modelCostId,
          history: callMessagesRef.current,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'AI request failed');
    }

    const data = await response.json();
    
    if (data.credits !== undefined && options?.onCreditsUpdate) {
      options.onCreditsUpdate(data.credits);
    }
    
    return data.response;
  };

  const floatTo16BitPCM = (float32Array: Float32Array): ArrayBuffer => {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return buffer;
  };

  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const cleanupCallResources = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    window.speechSynthesis.cancel();
    commitNextChunkRef.current = false;
  }, []);

  const autoRestart = useCallback(async () => {
    if (retryCountRef.current >= maxRetries) {
      console.error('Max auto-restart retries reached');
      setState('error');
      setError('Call failed after multiple retries. Please try again manually.');
      return;
    }
    retryCountRef.current += 1;
    console.log(`Auto-restarting call (attempt ${retryCountRef.current}/${maxRetries})...`);
    
    cleanupCallResources();
    
    // Small delay before restarting
    await new Promise(r => setTimeout(r, 1000));
    
    // startCall will reuse the existing conversationId and reload messages
    startCallInternal(lastModelLabelRef.current);
  }, []);

  const startCallInternal = useCallback(async (modelLabel?: string) => {
    try {
      setState('connecting');
      setError(null);
      setPartialTranscript('');
      setFinalTranscript('');
      setAiResponse('');

      // Ensure we have a conversation for this call
      await ensureConversation(modelLabel);

      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
        } 
      });
      streamRef.current = stream;

      // Get scribe token
      const token = await getScribeToken();

      // Connect to ElevenLabs WebSocket with VAD enabled
      const ws = new WebSocket(
        `wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=scribe_v2_realtime&token=${token}&vad_commit_strategy=true&vad_silence_threshold_secs=1.0`
      );
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setState('listening');
        
        const audioContext = new AudioContext({ sampleRate: 16000 });
        audioContextRef.current = audioContext;
        
        const source = audioContext.createMediaStreamSource(stream);
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;
        
        processor.onaudioprocess = (e) => {
          if (ws.readyState === WebSocket.OPEN) {
            const inputData = e.inputBuffer.getChannelData(0);
            const pcmData = floatTo16BitPCM(inputData);
            const base64Audio = arrayBufferToBase64(pcmData);
            
            ws.send(JSON.stringify({
              message_type: 'input_audio_chunk',
              audio_base_64: base64Audio,
              commit: commitNextChunkRef.current,
            }));
            commitNextChunkRef.current = false;
          }
        };
        
        source.connect(processor);
        processor.connect(audioContext.destination);
      };

      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('WebSocket message:', data.type || data.message_type, data);
          
          const msgType = data.type || data.message_type;
          
          if (msgType === 'session_started' || msgType === 'session_begin') {
            console.log('Session started:', data.session_id);
          } else if (msgType === 'transcript' && data.is_final === false) {
            setPartialTranscript(data.text || data.transcript || '');
          } else if (msgType === 'transcript' && data.is_final === true) {
            const transcript = data.text || data.transcript || '';
            setFinalTranscript(transcript);
            setPartialTranscript('');
            
            if (transcript.trim()) {
              await handleTranscriptCommit(transcript);
            }
          } else if (msgType === 'partial_transcript') {
            setPartialTranscript(data.text || '');
          } else if (msgType === 'committed_transcript' || msgType === 'committed_transcript_with_timestamps' || msgType === 'final_transcript') {
            const transcript = data.text || '';
            setFinalTranscript(transcript);
            setPartialTranscript('');
            
            if (transcript.trim()) {
              await handleTranscriptCommit(transcript);
            }
          } else if (msgType === 'error') {
            console.error('Scribe error:', data);
            setError(data.error || data.message || 'Transcription error');
            setState('error');
          }
        } catch (err) {
          console.error('Message parse error:', err);
        }
      };
      
      const handleTranscriptCommit = async (transcript: string) => {
        if (processorRef.current) {
          processorRef.current.disconnect();
        }
        
        // Save user message
        await saveMessage('user', transcript);
        
        try {
          const response = await sendToAI(transcript);
          setAiResponse(response);
          
          // Save AI response
          await saveMessage('assistant', response);
          
          await playTTS(response);
          
          console.log('TTS complete, resuming listening...', {
            hasStream: !!streamRef.current,
            wsState: wsRef.current?.readyState,
            hasAudioContext: !!audioContextRef.current
          });
          
          if (streamRef.current && audioContextRef.current) {
            if (audioContextRef.current.state === 'suspended') {
              await audioContextRef.current.resume();
            }
            
            setState('listening');
            setPartialTranscript('');
            
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              const source = audioContextRef.current.createMediaStreamSource(streamRef.current);
              const newProcessor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
              processorRef.current = newProcessor;
              
              newProcessor.onaudioprocess = (e) => {
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                  const inputData = e.inputBuffer.getChannelData(0);
                  const pcmData = floatTo16BitPCM(inputData);
                  const base64Audio = arrayBufferToBase64(pcmData);
                  
                  wsRef.current.send(JSON.stringify({
                    message_type: 'input_audio_chunk',
                    audio_base_64: base64Audio,
                    commit: commitNextChunkRef.current,
                  }));
                  commitNextChunkRef.current = false;
                }
              };
              
              source.connect(newProcessor);
              newProcessor.connect(audioContextRef.current.destination);
              console.log('Audio processing resumed');
              retryCountRef.current = 0; // Reset retry count on successful resume
            } else {
              console.warn('WebSocket closed, auto-restarting...');
              autoRestart();
            }
          } else {
            console.error('Cannot resume: missing stream or audio context, auto-restarting...');
            autoRestart();
          }
        } catch (err) {
          console.error('Processing error:', err);
          setError(err instanceof Error ? err.message : 'Processing failed');
          autoRestart();
        }
      };

      ws.onerror = (event) => {
        console.error('WebSocket error:', event);
        setError('Connection error');
        autoRestart();
      };

      ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        if (state !== 'idle') {
          setState('idle');
        }
      };

    } catch (err) {
      console.error('Start call error:', err);
      setError(err instanceof Error ? err.message : 'Failed to start call');
      setState('error');
      
      toast({
        title: 'Call Failed',
        description: err instanceof Error ? err.message : 'Could not start voice call',
        variant: 'destructive',
      });
    }
  }, [toast, options]);

  const startCall = useCallback(async (modelLabel?: string) => {
    lastModelLabelRef.current = modelLabel;
    retryCountRef.current = 0;
    await startCallInternal(modelLabel);
  }, [startCallInternal]);

  const endCall = useCallback(() => {
    retryCountRef.current = maxRetries; // Prevent auto-restart during intentional end
    cleanupCallResources();

    setState('idle');
    setPartialTranscript('');
    setFinalTranscript('');
    setAiResponse('');
    setError(null);
  }, []);

  const getConversationId = useCallback(() => conversationIdRef.current, []);

  const setConversationId = useCallback((id: string | null) => {
    conversationIdRef.current = id;
    if (id) {
      loadConversationMessages(id);
    } else {
      setCallMessages([]);
      callMessagesRef.current = [];
    }
  }, []);

  return {
    state,
    partialTranscript,
    finalTranscript,
    aiResponse,
    error,
    callMessages,
    startCall,
    endCall,
    answerNow: () => {
      commitNextChunkRef.current = true;
    },
    getConversationId,
    setConversationId,
  };
};
