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
import type { ModelCost } from '@/hooks/useModelCosts';

interface VoiceCallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreditsUpdate?: (credits: number) => void;
  onCallCreditsUpdate?: (credits: number) => void;
  selectedModel?: ModelCost | null;
  existingConversationId?: string | null;
}

const stateLabels: Record<VoiceCallState, string> = {
  idle: 'Ready to call',
  connecting: 'Connecting...',
  listening: 'Listening...',
  processing: 'Processing...',
  speaking: 'Speaking...',
  error: 'Error',
};

const VoiceCallModal = ({ open, onOpenChange, onCreditsUpdate, onCallCreditsUpdate, selectedModel, existingConversationId }: VoiceCallModalProps) => {
  const {
    state,
    partialTranscript,
    finalTranscript,
    aiResponse,
    error,
    callMessages,
    startCall,
    endCall,
    answerNow,
    setConversationId,
  } = useVoiceCall({ onCreditsUpdate, onCallCreditsUpdate, modelCostId: selectedModel?.id });

  const scrollRef = useRef<HTMLDivElement>(null);
  const canAnswerNow = state === 'listening' && !!(partialTranscript || finalTranscript);

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
  }, [callMessages, partialTranscript, finalTranscript, aiResponse]);

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
                state === 'processing' && "bg-secondary",
                state === 'speaking' && "bg-primary/30 animate-pulse",
                state === 'error' && "bg-destructive/20"
              )}
            >
              {state === 'connecting' && <Loader2 className="w-6 h-6 text-primary animate-spin" />}
              {state === 'listening' && <Mic className="w-6 h-6 text-accent-foreground" />}
              {state === 'processing' && <Loader2 className="w-6 h-6 text-secondary-foreground animate-spin" />}
              {state === 'speaking' && <Volume2 className="w-6 h-6 text-primary" />}
              {state === 'idle' && <Phone className="w-6 h-6 text-muted-foreground" />}
              {state === 'error' && <PhoneOff className="w-6 h-6 text-destructive" />}
            </div>
            <p className="text-sm font-medium text-foreground">
              {stateLabels[state]}
            </p>
          </div>

          {/* Conversation history - scrollable */}
          <div 
            ref={scrollRef}
            className="flex-1 min-h-[200px] max-h-[400px] overflow-y-auto rounded-lg bg-muted/30 border border-border p-3 space-y-3"
          >
            {callMessages.length === 0 && !partialTranscript && !finalTranscript && !aiResponse && !error && (
              <p className="text-sm text-muted-foreground text-center py-8">
                {state === 'listening' ? 'Start speaking...' : 'Waiting...'}
              </p>
            )}

            {callMessages.map((msg, index) => (
              <div key={index} className={cn(
                "flex gap-2 text-sm",
                msg.role === 'user' ? "justify-end" : "justify-start"
              )}>
                {msg.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="w-3.5 h-3.5 text-primary" />
                  </div>
                )}
                <div className={cn(
                  "rounded-lg px-3 py-2 max-w-[80%]",
                  msg.role === 'user' 
                    ? "bg-primary text-primary-foreground" 
                    : "bg-card border border-border text-foreground"
                )}>
                  {msg.content}
                </div>
                {msg.role === 'user' && (
                  <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center shrink-0 mt-0.5">
                    <User className="w-3.5 h-3.5 text-accent-foreground" />
                  </div>
                )}
              </div>
            ))}

            {/* Live partial/final transcript */}
            {partialTranscript && (
              <div className="flex gap-2 justify-end text-sm">
                <div className="rounded-lg px-3 py-2 max-w-[80%] bg-primary/50 text-primary-foreground italic">
                  {partialTranscript}
                </div>
                <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-3.5 h-3.5 text-accent-foreground" />
                </div>
              </div>
            )}

            {error && (
              <p className="text-sm text-destructive text-center py-2">
                {error}
              </p>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3 justify-center">
            <Button
              variant="secondary"
              size="sm"
              className="flex-1 max-w-[200px]"
              onClick={answerNow}
              disabled={!canAnswerNow}
            >
              Answer now
            </Button>

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
            {selectedModel ? `${selectedModel.cost} call credit${selectedModel.cost !== 1 ? 's' : ''} per message` : '1 call credit per message'}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VoiceCallModal;
