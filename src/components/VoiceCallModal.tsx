import { useEffect } from 'react';
import { Phone, PhoneOff, Mic, Loader2, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useVoiceCall, VoiceCallState } from '@/hooks/useVoiceCall';
import { cn } from '@/lib/utils';

interface VoiceCallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreditsUpdate?: (credits: number) => void;
}

const stateLabels: Record<VoiceCallState, string> = {
  idle: 'Ready to call',
  connecting: 'Connecting...',
  listening: 'Listening...',
  processing: 'Processing...',
  speaking: 'Speaking...',
  error: 'Error',
};

const VoiceCallModal = ({ open, onOpenChange, onCreditsUpdate }: VoiceCallModalProps) => {
  const {
    state,
    partialTranscript,
    finalTranscript,
    aiResponse,
    error,
    startCall,
    endCall,
    answerNow,
  } = useVoiceCall({ onCreditsUpdate });

  const canAnswerNow = state === 'listening' && !!(partialTranscript || finalTranscript);

  useEffect(() => {
    if (open && state === 'idle') {
      startCall();
    }
    
    return () => {
      if (!open && state !== 'idle') {
        endCall();
      }
    };
  }, [open]);

  const handleClose = () => {
    endCall();
    onOpenChange(false);
  };

  const isActive = state !== 'idle' && state !== 'error';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">Voice Call</DialogTitle>
        </DialogHeader>
        
        <div className="flex flex-col items-center gap-6 py-6">
          {/* Status indicator */}
          <div className="relative">
            <div 
              className={cn(
                "w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300",
                state === 'idle' && "bg-muted",
                state === 'connecting' && "bg-primary/20",
                state === 'listening' && "bg-accent animate-pulse",
                state === 'processing' && "bg-secondary",
                state === 'speaking' && "bg-primary/30 animate-pulse",
                state === 'error' && "bg-destructive/20"
              )}
            >
              {state === 'connecting' && <Loader2 className="w-10 h-10 text-primary animate-spin" />}
              {state === 'listening' && <Mic className="w-10 h-10 text-accent-foreground" />}
              {state === 'processing' && <Loader2 className="w-10 h-10 text-secondary-foreground animate-spin" />}
              {state === 'speaking' && <Volume2 className="w-10 h-10 text-primary" />}
              {state === 'idle' && <Phone className="w-10 h-10 text-muted-foreground" />}
              {state === 'error' && <PhoneOff className="w-10 h-10 text-destructive" />}
            </div>
            
            {/* Pulsing ring for active states */}
            {(state === 'listening' || state === 'speaking') && (
              <div className={cn(
                "absolute inset-0 rounded-full animate-ping opacity-30",
                state === 'listening' && "bg-accent-foreground",
                state === 'speaking' && "bg-primary"
              )} />
            )}
          </div>

          {/* State label */}
          <p className="text-lg font-medium text-foreground">
            {stateLabels[state]}
          </p>

          {/* Transcription display */}
          <div className="w-full min-h-[80px] p-4 bg-muted/50 rounded-lg">
            {partialTranscript && (
              <p className="text-sm text-muted-foreground italic">
                {partialTranscript}
              </p>
            )}
            {finalTranscript && !partialTranscript && (
              <p className="text-sm text-foreground">
                <span className="font-medium">You:</span> {finalTranscript}
              </p>
            )}
            {aiResponse && (
              <p className="text-sm text-primary mt-2">
                <span className="font-medium">AI:</span> {aiResponse}
              </p>
            )}
            {error && (
              <p className="text-sm text-destructive">
                {error}
              </p>
            )}
            {!partialTranscript && !finalTranscript && !aiResponse && !error && (
              <p className="text-sm text-muted-foreground text-center">
                {state === 'listening' ? 'Start speaking...' : 'Waiting...'}
              </p>
            )}
          </div>

          {/* Answer now button (manual commit) */}
          <Button
            variant="secondary"
            size="lg"
            className="w-full h-12"
            onClick={answerNow}
            disabled={!canAnswerNow}
          >
            Answer now
          </Button>

          {/* End call button */}
          <Button
            variant="destructive"
            size="lg"
            className="rounded-full w-16 h-16"
            onClick={handleClose}
          >
            <PhoneOff className="w-6 h-6" />
          </Button>
          
          <p className="text-xs text-muted-foreground">
            Powered by GPT-5 Nano • 1 credit per message
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VoiceCallModal;
