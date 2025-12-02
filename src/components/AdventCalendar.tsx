import { useState } from "react";
import { Gift, Lock, Check, Sparkles, Crown, Star } from "lucide-react";
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
  const { claims, loading, claimDay, isClaimable, isClaimed, currentDay, currentMonth, isVip, vipExpiresAt } = useAdventCalendar();
  const [openingDay, setOpeningDay] = useState<number | null>(null);
  const [reward, setReward] = useState<number | null>(null);
  const [showReward, setShowReward] = useState(false);

  const [gotVip, setGotVip] = useState(false);

  const handleClaimDay = async (day: number) => {
    setOpeningDay(day);
    const credits = await claimDay(day);
    if (credits === -1) {
      // Got VIP
      setGotVip(true);
      setTimeout(() => setGotVip(false), 3000);
    } else if (credits && credits > 0) {
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

  const getVipDaysRemaining = () => {
    if (!vipExpiresAt) return 0;
    const now = new Date();
    const expires = new Date(vipExpiresAt);
    const diff = expires.getTime() - now.getTime();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
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
        
        {gotVip && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/95 z-50 animate-pulse">
            <div className="text-center">
              <Crown className="h-16 w-16 mx-auto mb-4 text-yellow-500" />
              <p className="text-xl font-bold text-yellow-500">VIP Status!</p>
              <p className="text-muted-foreground">20 credits/day for 15 days</p>
            </div>
          </div>
        )}

        {isVip && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 mb-4">
            <Crown className="h-5 w-5 text-yellow-500" />
            <div>
              <p className="text-sm font-semibold text-yellow-600 dark:text-yellow-400">VIP Active</p>
              <p className="text-xs text-muted-foreground">{getVipDaysRemaining()} days remaining • 20 credits/day</p>
            </div>
          </div>
        )}

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
                    claimed && "bg-green-500/20 border-2 border-green-500 text-green-600 dark:text-green-400",
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
                      {claimData?.credits_awarded === 0 ? (
                        <>
                          <Star className="h-4 w-4 mb-1 text-yellow-500" />
                          <span className="text-xs font-semibold text-yellow-500">VIP</span>
                        </>
                      ) : (
                        <>
                          <Check className="h-4 w-4 mb-1" />
                          <span className="text-xs font-semibold">+{claimData?.credits_awarded}</span>
                        </>
                      )}
                      <span className="text-[10px] text-green-600/70 dark:text-green-400/70">opened</span>
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
