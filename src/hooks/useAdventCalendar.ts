import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface AdventClaim {
  day_number: number;
  credits_awarded: number;
  claimed_at: string;
}

interface VipStatus {
  expires_at: string;
}

export const useAdventCalendar = () => {
  const [claims, setClaims] = useState<AdventClaim[]>([]);
  const [vipStatus, setVipStatus] = useState<VipStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const currentYear = new Date().getFullYear();
  const currentDay = new Date().getDate();
  const currentMonth = new Date().getMonth() + 1;

  useEffect(() => {
    fetchClaims();
    fetchVipStatus();
  }, []);

  const fetchClaims = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('advent_claims')
        .select('day_number, credits_awarded, claimed_at')
        .eq('user_id', user.id)
        .eq('year', currentYear);

      if (error) throw error;
      setClaims(data || []);
    } catch (error) {
      console.error('Error fetching advent claims:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchVipStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('vip_status')
        .select('expires_at')
        .eq('user_id', user.id)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      setVipStatus(data);
    } catch (error) {
      console.error('Error fetching VIP status:', error);
    }
  };

  const isVip = (): boolean => {
    if (!vipStatus) return false;
    return new Date(vipStatus.expires_at) > new Date();
  };

  const claimDay = async (day: number): Promise<number | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Please log in",
          description: "You need to be logged in to claim advent rewards.",
          variant: "destructive",
        });
        return null;
      }

      // Check if it's December
      if (currentMonth !== 12) {
        toast({
          title: "Not December yet!",
          description: "The advent calendar is only available in December.",
          variant: "destructive",
        });
        return null;
      }

      // Check if day is available (can only open current day or past days)
      if (day > currentDay) {
        toast({
          title: "Too early!",
          description: "You can only open this door on December " + day + ".",
          variant: "destructive",
        });
        return null;
      }

      // Check if already claimed
      if (claims.some(c => c.day_number === day)) {
        toast({
          title: "Already claimed",
          description: "You've already opened this door!",
          variant: "destructive",
        });
        return null;
      }

      // Check if user is already VIP
      const userIsVip = isVip();
      
      // 10% chance to get VIP if not already VIP
      const getsVip = !userIsVip && Math.random() < 0.1;
      
      // Generate random credits (1-15)
      const creditsAwarded = getsVip ? 0 : Math.floor(Math.random() * 15) + 1;

      // Insert claim
      const { error: claimError } = await supabase
        .from('advent_claims')
        .insert({
          user_id: user.id,
          day_number: day,
          credits_awarded: creditsAwarded,
          year: currentYear,
        });

      if (claimError) throw claimError;

      // If user gets VIP, create VIP status
      if (getsVip) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 15);
        
        const { error: vipError } = await supabase
          .from('vip_status')
          .upsert({
            user_id: user.id,
            expires_at: expiresAt.toISOString(),
          });
        
        if (vipError) throw vipError;
        setVipStatus({ expires_at: expiresAt.toISOString() });
        
        toast({
          title: "🌟 VIP Reward!",
          description: "You received 15 days of VIP status! (20 credits/day)",
        });
        
        // Update local state
        setClaims(prev => [...prev, {
          day_number: day,
          credits_awarded: 0,
          claimed_at: new Date().toISOString(),
        }]);
        
        return -1; // Special return value for VIP
      }

      // Update user credits
      const { data: currentCredits } = await supabase
        .from('user_credits')
        .select('credits')
        .eq('user_id', user.id)
        .single();

      if (currentCredits) {
        await supabase
          .from('user_credits')
          .update({ credits: currentCredits.credits + creditsAwarded })
          .eq('user_id', user.id);
      }

      // Update local state
      setClaims(prev => [...prev, {
        day_number: day,
        credits_awarded: creditsAwarded,
        claimed_at: new Date().toISOString(),
      }]);

      toast({
        title: "🎄 Advent Reward!",
        description: `You received ${creditsAwarded} credits!`,
      });

      return creditsAwarded;
    } catch (error) {
      console.error('Error claiming advent day:', error);
      toast({
        title: "Error",
        description: "Failed to claim reward. Please try again.",
        variant: "destructive",
      });
      return null;
    }
  };

  const isClaimable = (day: number): boolean => {
    if (currentMonth !== 12) return false;
    if (day > currentDay) return false;
    if (claims.some(c => c.day_number === day)) return false;
    return true;
  };

  const isClaimed = (day: number): boolean => {
    return claims.some(c => c.day_number === day);
  };

  return {
    claims,
    loading,
    claimDay,
    isClaimable,
    isClaimed,
    currentDay,
    currentMonth,
    isVip: isVip(),
    vipExpiresAt: vipStatus?.expires_at,
  };
};
