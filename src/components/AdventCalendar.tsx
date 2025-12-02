import { useState } from "react";
import { Gift, Lock, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAdventCalendar } from "@/hooks/useAdventCalendar";
import { cn } from "@/lib/utils";

interface AdventCalendarProps {
  onCreditsUpdate: (credits: number) => void;
}

const AdventCalendar = ({ onCreditsUpdate }: AdventCalendarProps) => {
  const { claims, loading, claimDay, isClaimable, isClaimed, currentDay, currentMonth } = useAdventCalendar();
  const [openingDay, setOpeningDay] = useState<number | null>(null);
  const [reward, setReward] = useState<number | null>(null);
  const [showReward, setShowReward] = useState(false);

  const handleClaimDay = async (day: number) => {
    setOpeningDay(day);
    const credits = await claimDay(day);
    if (credits) {
      setReward(credits);
      setShowReward(true);
      onCreditsUpdate(credits);
      setTimeout(() => {
        setShowReward(false);
        setReward(null);
      }, 2000);
    }
    setOpeningDay(null);
  };

  const days = Array.from({ length: 24 }, (_, i) => i + 1);

  // Shuffle days for a more interesting layout
  const shuffledPositions = [
    24, 3, 17, 8, 12, 1, 19, 5, 22, 11,
    7, 15, 2, 20, 9, 14, 4, 18, 6, 23,
    10, 16, 21, 13
  ];

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" title="Advent Calendar">
          <Gift className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Advent Calendar 2025
          </DialogTitle>
        </DialogHeader>
        
        {currentMonth !== 12 ? (
          <div className="text-center py-8">
            <Gift className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">
              The advent calendar will be available in December!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {shuffledPositions.map((day) => {
              const claimed = isClaimed(day);
              const claimable = isClaimable(day);
              const isLocked = day > currentDay;
              const isOpening = openingDay === day;
              const claimData = claims.find(c => c.day_number === day);

              return (
                <button
                  key={day}
                  onClick={() => claimable && handleClaimDay(day)}
                  disabled={!claimable || isOpening}
                  className={cn(
                    "aspect-square rounded-lg flex flex-col items-center justify-center text-sm font-bold transition-all relative overflow-hidden",
                    claimed && "bg-primary/20 border-2 border-primary text-primary",
                    claimable && "bg-accent hover:bg-accent/80 border-2 border-dashed border-primary cursor-pointer hover:scale-105",
                    isLocked && "bg-muted border border-border text-muted-foreground",
                    isOpening && "animate-pulse"
                  )}
                >
                  {showReward && reward && openingDay === null && claimData?.credits_awarded === reward && (
                    <div className="absolute inset-0 flex items-center justify-center bg-primary text-primary-foreground animate-bounce">
                      +{reward}
                    </div>
                  )}
                  
                  {claimed ? (
                    <>
                      <Check className="h-4 w-4 mb-1" />
                      <span className="text-xs">+{claimData?.credits_awarded}</span>
                    </>
                  ) : isLocked ? (
                    <>
                      <Lock className="h-4 w-4 mb-1" />
                      <span>{day}</span>
                    </>
                  ) : (
                    <>
                      <Gift className="h-4 w-4 mb-1" />
                      <span>{day}</span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center mt-2">
          Open a door each day to receive 1-15 bonus credits!
        </p>
      </DialogContent>
    </Dialog>
  );
};

export default AdventCalendar;
