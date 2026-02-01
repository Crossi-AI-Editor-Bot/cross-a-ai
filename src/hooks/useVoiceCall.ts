import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type VoiceCallState = 'idle' | 'connecting' | 'listening' | 'processing' | 'speaking' | 'error';

interface UseVoiceCallOptions {
  onCreditsUpdate?: (credits: number) => void;
}

export const useVoiceCall = (options?: UseVoiceCallOptions) => {
  const [state, setState] = useState<VoiceCallState>('idle');
  const [partialTranscript, setPartialTranscript] = useState('');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  
  const { toast } = useToast();

  const getScribeToken = async (): Promise<string> => {
    const { data, error } = await supabase.functions.invoke('elevenlabs-token');
    if (error || !data?.token) {
      throw new Error('Failed to get transcription token');
    }
    return data.token;
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
      console.error('TTS error:', err);
      throw err;
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
        body: JSON.stringify({ message: transcript }),
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

  const startCall = useCallback(async () => {
    try {
      setState('connecting');
      setError(null);
      setPartialTranscript('');
      setFinalTranscript('');
      setAiResponse('');

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

      // Connect to ElevenLabs WebSocket with correct URL
      const ws = new WebSocket(
        `wss://api.elevenlabs.io/v1/speech-to-text/realtime?model_id=scribe_v2_realtime&token=${token}`
      );
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setState('listening');
        
        // Create audio context for processing
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
            }));
          }
        };
        
        source.connect(processor);
        processor.connect(audioContext.destination);
      };

      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('WebSocket message:', data.message_type);
          
          if (data.message_type === 'session_started') {
            console.log('Session started:', data.session_id);
          } else if (data.message_type === 'partial_transcript') {
            setPartialTranscript(data.text || '');
          } else if (data.message_type === 'committed_transcript' || data.message_type === 'committed_transcript_with_timestamps') {
            const transcript = data.text || '';
            setFinalTranscript(transcript);
            setPartialTranscript('');
            
            if (transcript.trim()) {
              // Stop audio processing while handling response
              if (processorRef.current) {
                processorRef.current.disconnect();
              }
              
              try {
                const response = await sendToAI(transcript);
                setAiResponse(response);
                await playTTS(response);
                
                // Resume listening after speaking
                if (streamRef.current && wsRef.current?.readyState === WebSocket.OPEN && audioContextRef.current) {
                  setState('listening');
                  setPartialTranscript('');
                  
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
                      }));
                    }
                  };
                  
                  source.connect(newProcessor);
                  newProcessor.connect(audioContextRef.current.destination);
                }
              } catch (err) {
                console.error('Processing error:', err);
                setError(err instanceof Error ? err.message : 'Processing failed');
                setState('error');
              }
            }
          } else if (data.message_type === 'error') {
            console.error('Scribe error:', data);
            setError(data.error || 'Transcription error');
            setState('error');
          }
        } catch (err) {
          console.error('Message parse error:', err);
        }
      };

      ws.onerror = (event) => {
        console.error('WebSocket error:', event);
        setError('Connection error');
        setState('error');
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

  const endCall = useCallback(() => {
    // Stop audio playback
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    // Stop audio processor
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Stop media recorder
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;

    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    // Stop media stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    setState('idle');
    setPartialTranscript('');
    setFinalTranscript('');
    setAiResponse('');
    setError(null);
  }, []);

  return {
    state,
    partialTranscript,
    finalTranscript,
    aiResponse,
    error,
    startCall,
    endCall,
  };
};
