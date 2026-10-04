import { useEffect, useRef } from 'react';
import { Phone, PhoneOff, Mic, Loader2, Volume2, User, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useVoiceCall, VoiceCallState } from '@/hooks/useVoiceCall';
import { cn } from '@/lib/utils';
import { useMods } from '@/hooks/useMods';
import { useVipStatus } from '@/hooks/useVipStatus';
import type { ModelCost } from '@/hooks/useModelCosts';

interface VoiceCallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreditsUpdate?: (credits: number) => void;
  
  selectedModel?: ModelCost | null;
  existingConversationId?: string | null;
}

const stateLabels: Record<VoiceCallState, string> = {
  idle: 'Ready to call',
  connecting: 'Connecting...',
  listening: 'Listening...',
  speaking: 'Speaking...',
  error: 'Error',
};

const VoiceCallModal = ({ open, onOpenChange, onCreditsUpdate, selectedModel, existingConversationId }: VoiceCallModalProps) => {
  const vip = useVipStatus() as any;
  const mods = useMods() as any;
  const {
    state,
    partialTranscript,
    aiResponse,
    error,
    callMessages,
    callCredits,
    callRate,
    startCall,
    endCall,
    setConversationId,
  } = useVoiceCall({ onCreditsUpdate, modelCostId: selectedModel?.id, isDynamic: vip.isDynamic, topupDiscountPercent: vip.topupDiscountPercent });
  const callColor = mods?.has?.('credit-recolor') ? mods?.settings?.creditColors?.call : undefined;

  const scrollRef = useRef<HTMLDivElement>(null);


  // Set conversation ID when modal opens
  useEffect(() => {
    if (open && existingConversationId) {
      setConversationId(existingConversationId);
    }
  }, [open, existingConversationId, setConversationId]);

  useEffect(() => {
    if (open && state === 'idle') {
      startCall(selectedModel?.label);
    }
    
    return () => {
      if (!open && state !== 'idle') {
        endCall();
      }
    };
  }, [open]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [callMessages, partialTranscript, aiResponse]);


  const handleClose = () => {
    endCall();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-center">
            {selectedModel ? selectedModel.label : 'Voice Call'}
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex flex-col gap-4 flex-1 min-h-0">
          {/* Status indicator - compact */}
          <div className="flex items-center justify-center gap-3">
            <div 
              className={cn(
                "w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 shrink-0",
                state === 'idle' && "bg-muted",
                state === 'connecting' && "bg-primary/20",
                state === 'listening' && "bg-accent animate-pulse",
                state === 'speaking' && "bg-primary/30 animate-pulse",
                state === 'error' && "bg-destructive/20"
              )}
            >
              {state === 'connecting' && <Loader2 className="w-6 h-6 text-primary animate-spin" />}
              {state === 'listening' && <Mic className="w-6 h-6 text-accent-foreground" />}
              {state === 'speaking' && <Volume2 className="w-6 h-6 text-primary" />}
              {state === 'idle' && <Phone className="w-6 h-6 text-muted-foreground" />}
              {state === 'error' && <PhoneOff className="w-6 h-6 text-destructive" />}

            </div>
            <p className="text-sm font-medium text-foreground">
              {stateLabels[state]}
            </p>
          </div>

          {/* Colorful sound waves */}
          <div className="relative flex-1 min-h-[220px] rounded-2xl overflow-hidden border border-border bg-muted/30 flex items-center justify-center">
            <div
              className={cn(
                "absolute w-40 h-40 rounded-full blur-3xl opacity-60 transition-all duration-700",
                state === 'speaking' ? "bg-primary scale-125" : state === 'listening' ? "bg-accent scale-100" : "bg-muted scale-75"
              )}
              style={{ animation: state === 'speaking' || state === 'listening' ? 'pulse 2s ease-in-out infinite' : undefined }}
            />
            <div className="relative flex items-center gap-1.5 h-32">
              {Array.from({ length: 24 }).map((_, i) => {
                const active = state === 'speaking' || state === 'listening';
                const hue = (i * 15 + (state === 'speaking' ? 0 : 180)) % 360;
                return (
                  <span
                    key={i}
                    className="w-1.5 rounded-full"
                    style={{
                      height: active ? '100%' : '12%',
                      background: `linear-gradient(to top, hsl(${hue} 90% 55%), hsl(${(hue + 60) % 360} 90% 65%))`,
                      animation: active ? `voiceWave ${0.6 + (i % 5) * 0.15}s ease-in-out ${i * 0.05}s infinite alternate` : undefined,
                      transform: active ? undefined : 'scaleY(1)',
                      transition: 'height 0.4s',
                    }}
                  />
                );
              })}
            </div>
            {error && (
              <p className="absolute bottom-3 left-3 right-3 text-sm text-destructive text-center">{error}</p>
            )}
            <style>{`@keyframes voiceWave { 0% { transform: scaleY(0.15); } 100% { transform: scaleY(1); } }`}</style>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center">
            <Button
              variant="destructive"
              size="lg"
              className="rounded-full w-14 h-14 shrink-0"
              onClick={handleClose}
            >
              <PhoneOff className="w-5 h-5" />
            </Button>
          </div>

          
          <p className="text-xs text-muted-foreground text-center">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold border"
              style={{ color: callColor || 'hsl(142 70% 50%)', borderColor: callColor || 'hsl(142 70% 50%)', background: 'hsl(142 70% 50% / 0.1)' }}
            >
              <Phone className="w-3 h-3" />
              {callCredits === null ? '…' : Number(callCredits.toFixed(5))} call credits
            </span>
            <span className="block mt-1">{callRate} call credits per 1000 tokens</span>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VoiceCallModal;
