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
  const scribeTokenRef = useRef<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
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
        } 
      });
      streamRef.current = stream;

      // Get scribe token
      const token = await getScribeToken();
      scribeTokenRef.current = token;

      // Connect to ElevenLabs WebSocket
      const ws = new WebSocket(
        `wss://api.elevenlabs.io/v1/realtime_scribe/stream?model_id=scribe_v2_realtime&token=${token}`
      );
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setState('listening');
        
        // Start recording
        const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        mediaRecorderRef.current = mediaRecorder;

        mediaRecorder.ondataavailable = async (event) => {
          if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
            const arrayBuffer = await event.data.arrayBuffer();
            const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
            ws.send(JSON.stringify({ audio: base64 }));
          }
        };

        mediaRecorder.start(250); // Send chunks every 250ms
      };

      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'partial_transcript') {
            setPartialTranscript(data.text || '');
          } else if (data.type === 'committed_transcript') {
            const transcript = data.text || '';
            setFinalTranscript(transcript);
            setPartialTranscript('');
            
            if (transcript.trim()) {
              // Stop recording while processing
              if (mediaRecorderRef.current?.state === 'recording') {
                mediaRecorderRef.current.stop();
              }
              
              try {
                const response = await sendToAI(transcript);
                setAiResponse(response);
                await playTTS(response);
                
                // Resume listening after speaking
                if (streamRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
                  setState('listening');
                  setPartialTranscript('');
                  
                  const newRecorder = new MediaRecorder(streamRef.current, { mimeType: 'audio/webm' });
                  mediaRecorderRef.current = newRecorder;
                  
                  newRecorder.ondataavailable = async (e) => {
                    if (e.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
                      const arrayBuffer = await e.data.arrayBuffer();
                      const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
                      wsRef.current.send(JSON.stringify({ audio: base64 }));
                    }
                  };
                  
                  newRecorder.start(250);
                }
              } catch (err) {
                console.error('Processing error:', err);
                setError(err instanceof Error ? err.message : 'Processing failed');
                setState('error');
              }
            }
          } else if (data.type === 'error') {
            console.error('Scribe error:', data);
            setError(data.message || 'Transcription error');
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

      ws.onclose = () => {
        console.log('WebSocket closed');
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
