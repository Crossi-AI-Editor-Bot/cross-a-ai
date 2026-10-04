import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getUserId } from '@/lib/authUser';

export type VoiceCallState = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error';

export interface CallMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface UseVoiceCallOptions {
  onCreditsUpdate?: (credits: number) => void;
  modelCostId?: string;
  conversationId?: string | null;
  isDynamic?: boolean;
  topupDiscountPercent?: number;
}

const LIVE_WS_BASE =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained';

const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;

const floatTo16BitPCM = (input: Float32Array): ArrayBuffer => {
  const buffer = new ArrayBuffer(input.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
};

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

const base64ToPcmFloat = (base64: string): Float32Array => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const view = new DataView(bytes.buffer);
  const samples = new Float32Array(bytes.length / 2);
  for (let i = 0; i < samples.length; i++) {
    samples[i] = view.getInt16(i * 2, true) / 0x8000;
  }
  return samples;
};

export const useVoiceCall = (options?: UseVoiceCallOptions) => {
  const [state, setState] = useState<VoiceCallState>('idle');
  const [partialTranscript, setPartialTranscript] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [callMessages, setCallMessages] = useState<CallMessage[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const playHeadRef = useRef(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  const conversationIdRef = useRef<string | null>(options?.conversationId || null);
  const callMessagesRef = useRef<CallMessage[]>([]);
  const userTurnRef = useRef('');
  const modelTurnRef = useRef('');
  const endedRef = useRef(false);
  const modelLabelRef = useRef<string | undefined>(undefined);

  const { toast } = useToast();

  /* ---------------- conversation persistence (lazy: never leaves empty chats) --------------- */

  const loadConversationMessages = useCallback(async (convId: string) => {
    const { data } = await supabase
      .from('messages')
      .select('role, content')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true });

    const msgs = (data || []).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));
    callMessagesRef.current = msgs;
    setCallMessages(msgs);
  }, []);

  // Only creates the chat once there is something worth keeping.
  const ensureConversation = useCallback(async (): Promise<string | null> => {
    if (conversationIdRef.current) return conversationIdRef.current;
    const userId = await getUserId();
    if (!userId) return null;

    const { data, error: insertError } = await supabase
      .from('conversations')
      .insert({ user_id: userId, title: `📞 ${modelLabelRef.current || 'Voice Call'}` })
      .select('id')
      .single();

    if (insertError || !data) return null;
    conversationIdRef.current = data.id;
    return data.id;
  }, []);

  // Calls are ephemeral: nothing is saved to a chat.
  const persistExchange = useCallback(
    async (_userText: string, _assistantText: string) => {
      void ensureConversation;
    },
    [ensureConversation],
  );

  const pendingTokensRef = useRef(0);
  const [callCredits, setCallCredits] = useState<number | null>(null);
  const [callRate, setCallRate] = useState<number>(1);

  const invokeCharge = useCallback(async (blocks: number) => {
    const { data, error: fnError } = await supabase.functions.invoke('call-charge', {
      body: { modelCostId: options?.modelCostId, blocks },
    });
    let payload: any = data;
    let status = 200;
    if (fnError) {
      status = (fnError as any)?.context?.status ?? 500;
      try { payload = await (fnError as any)?.context?.json?.(); } catch { /* ignore */ }
    }
    if (payload?.credits !== undefined) {
      setCallCredits(Number(payload.credits));
      options?.onCreditsUpdate?.(Number(payload.credits));
    }
    if (payload?.rate !== undefined) setCallRate(Number(payload.rate));
    return status;
  }, [options?.modelCostId, options?.onCreditsUpdate]);

  // Returns false when the user ran out of call credits (and no Dynamic-VIP top-up worked).
  const chargeExchange = useCallback(async (blocks: number): Promise<boolean> => {
    try {
      let status = await invokeCharge(blocks);
      if (status === 402 && options?.isDynamic) {
        const { data, error: e } = await supabase.functions.invoke('purchase-credits', {
          body: { kind: 'call', amount: 10, discount_percent: options?.topupDiscountPercent ?? 10 },
        });
        if (!e && !(data as any)?.error) status = await invokeCharge(blocks);
      }
      return status !== 402;
    } catch {
      return true;
    }
  }, [invokeCharge, options?.isDynamic, options?.topupDiscountPercent]);

  /* ------------------------------- audio playback ------------------------------ */

  const stopPlayback = useCallback(() => {
    activeSourcesRef.current.forEach((s) => {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    });
    activeSourcesRef.current = [];
    playHeadRef.current = 0;
  }, []);

  const enqueueAudio = useCallback((base64: string) => {
    const ctx = outputCtxRef.current;
    if (!ctx) return;
    const samples = base64ToPcmFloat(base64);
    if (!samples.length) return;

    const buffer = ctx.createBuffer(1, samples.length, OUTPUT_SAMPLE_RATE);
    buffer.getChannelData(0).set(samples);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const startAt = Math.max(ctx.currentTime + 0.05, playHeadRef.current);
    source.start(startAt);
    playHeadRef.current = startAt + buffer.duration;
    activeSourcesRef.current.push(source);
    source.onended = () => {
      activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== source);
      if (activeSourcesRef.current.length === 0 && !endedRef.current) {
        setState((prev) => (prev === 'speaking' ? 'listening' : prev));
      }
    };
  }, []);

  /* --------------------------------- teardown -------------------------------- */

  const cleanup = useCallback(() => {
    stopPlayback();
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (inputCtxRef.current) {
      inputCtxRef.current.close().catch(() => {});
      inputCtxRef.current = null;
    }
    if (outputCtxRef.current) {
      outputCtxRef.current.close().catch(() => {});
      outputCtxRef.current = null;
    }
    if (wsRef.current) {
      const ws = wsRef.current;
      wsRef.current = null;
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;
      try {
        ws.close();
      } catch {
        /* noop */
      }
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, [stopPlayback]);

  /* --------------------------------- start ---------------------------------- */

  const startCall = useCallback(
    async (modelLabel?: string) => {
      endedRef.current = false;
      modelLabelRef.current = modelLabel;
      userTurnRef.current = '';
      modelTurnRef.current = '';
      setError(null);
      setPartialTranscript('');
      setAiResponse('');
      setState('connecting');
      pendingTokensRef.current = 0;

      try {
        const balanceStatus = await invokeCharge(0);
        if (balanceStatus === 200) {
          // fetch current balance happened; block if empty and not dynamic
        }
        const { data: session, error: sessionError } = await supabase.functions.invoke(
          'gemini-live-token',
          { body: { modelCostId: options?.modelCostId } },
        );

        if (sessionError) {
          let message = 'Could not start the call';
          try {
            const ctx = (sessionError as any)?.context;
            if (ctx?.text) {
              const parsed = JSON.parse(await ctx.text());
              message = parsed.error || message;
            }
          } catch {
            /* keep default */
          }
          throw new Error(message);
        }
        if (!session?.token) throw new Error(session?.error || 'Could not start the call');

        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: INPUT_SAMPLE_RATE,
          },
        });
        streamRef.current = stream;

        outputCtxRef.current = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE });

        const ws = new WebSocket(`${LIVE_WS_BASE}?access_token=${session.token}`);
        wsRef.current = ws;

        ws.onopen = () => {
          ws.send(
            JSON.stringify({
              setup: {
                model: session.model,
                generationConfig: {
                  responseModalities: ['AUDIO'],
                },
                systemInstruction: { parts: [{ text: session.systemPrompt }] },
                inputAudioTranscription: {},
                outputAudioTranscription: {},
              },
            }),
          );
        };

        ws.onmessage = async (event) => {
          const raw =
            typeof event.data === 'string' ? event.data : await (event.data as Blob).text();
          let msg: any;
          try {
            msg = JSON.parse(raw);
          } catch {
            return;
          }

          if (msg.setupComplete) {
            setState('listening');

            const inputCtx = new AudioContext({ sampleRate: INPUT_SAMPLE_RATE });
            inputCtxRef.current = inputCtx;
            const source = inputCtx.createMediaStreamSource(stream);
            const processor = inputCtx.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;
            processor.onaudioprocess = (e) => {
              if (wsRef.current?.readyState !== WebSocket.OPEN) return;
              const pcm = floatTo16BitPCM(e.inputBuffer.getChannelData(0));
              wsRef.current.send(
                JSON.stringify({
                  realtimeInput: {
                    audio: {
                      data: arrayBufferToBase64(pcm),
                      mimeType: `audio/pcm;rate=${INPUT_SAMPLE_RATE}`,
                    },
                  },
                }),
              );
            };
            source.connect(processor);
            processor.connect(inputCtx.destination);
            return;
          }

          const usedTokens = Number(msg.usageMetadata?.totalTokenCount ?? 0);
          if (usedTokens > 0) {
            pendingTokensRef.current += usedTokens;
            const blocks = Math.floor(pendingTokensRef.current / 1000);
            if (blocks > 0) {
              pendingTokensRef.current -= blocks * 1000;
              chargeExchange(blocks).then((ok) => {
                if (!ok && !endedRef.current) {
                  endedRef.current = true;
                  cleanup();
                  setError('Out of call credits');
                  setState('error');
                  toast({ title: 'Out of call credits', description: 'Buy more call credits in the VIP shop.', variant: 'destructive' });
                }
              });
            }
          }

          const content = msg.serverContent;
          if (!content) {
            if (msg.error) {
              setError(msg.error.message || 'Call error');
              setState('error');
            }
            return;
          }

          if (content.interrupted) {
            stopPlayback();
            setState('listening');
          }

          if (content.inputTranscription?.text) {
            userTurnRef.current += content.inputTranscription.text;
            setPartialTranscript(userTurnRef.current);
          }

          if (content.outputTranscription?.text) {
            modelTurnRef.current += content.outputTranscription.text;
            setAiResponse(modelTurnRef.current);
          }

          const parts = content.modelTurn?.parts || [];
          for (const part of parts) {
            const inline = part.inlineData;
            if (inline?.data && String(inline.mimeType || '').startsWith('audio/')) {
              setState('speaking');
              enqueueAudio(inline.data);
            }
            if (part.text) {
              modelTurnRef.current += part.text;
              setAiResponse(modelTurnRef.current);
            }
          }

          if (content.turnComplete || content.generationComplete) {
            const userText = userTurnRef.current;
            const modelText = modelTurnRef.current;
            userTurnRef.current = '';
            modelTurnRef.current = '';
            setPartialTranscript('');
            setAiResponse('');
            if (userText.trim() || modelText.trim()) {
              await persistExchange(userText, modelText);
              // calls are free
            }
          }
        };

        ws.onerror = () => {
          if (endedRef.current) return;
          setError('Connection error');
          setState('error');
        };

        ws.onclose = (event) => {
          if (endedRef.current) return;
          if (event.code !== 1000) {
            setError(event.reason || 'The call was disconnected');
            setState('error');
          } else {
            setState('idle');
          }
        };
      } catch (err) {
        cleanup();
        const message = err instanceof Error ? err.message : 'Failed to start call';
        setError(message);
        setState('error');
        toast({ title: 'Call failed', description: message, variant: 'destructive' });
      }
    },
    [options?.modelCostId, cleanup, enqueueAudio, persistExchange, chargeExchange, stopPlayback, toast],
  );

  const endCall = useCallback(async () => {
    endedRef.current = true;

    // Flush anything captured in the turn that was still running.
    const userText = userTurnRef.current;
    const modelText = modelTurnRef.current;
    userTurnRef.current = '';
    modelTurnRef.current = '';

    cleanup();
    setState('idle');
    setPartialTranscript('');
    setAiResponse('');
    setError(null);

    if (userText.trim() || modelText.trim()) {
      await persistExchange(userText, modelText);
    }
  }, [cleanup, persistExchange]);

  const getConversationId = useCallback(() => conversationIdRef.current, []);

  const setConversationId = useCallback(
    (id: string | null) => {
      conversationIdRef.current = id;
      if (id) {
        loadConversationMessages(id);
      } else {
        callMessagesRef.current = [];
        setCallMessages([]);
      }
    },
    [loadConversationMessages],
  );

  useEffect(() => cleanup, [cleanup]);

  return {
    state,
    partialTranscript,
    finalTranscript: '',
    aiResponse,
    error,
    callMessages,
    startCall,
    endCall,
    getConversationId,
    setConversationId,
  };
};
