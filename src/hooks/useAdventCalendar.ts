import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useIsAdmin } from "@/hooks/useIsAdmin";

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
  const { isAdmin } = useIsAdmin();

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
    if (isAdmin) return true;
    if (!vipStatus) return false;
    return new Date(vipStatus.expires_at) > new Date();
  };

  const claimDay = async (day: number): Promise<number | null> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({
          title: "Please log in",
          description: "You need to be logged in to claim advent rewards.",
          variant: "destructive",
        });
        return null;
      }

      // Call the secure edge function
      const { data, error } = await supabase.functions.invoke('claim-advent', {
        body: { day },
      });

      if (error) {
        console.error('Edge function error:', error);
        toast({
          title: "Error",
          description: "Failed to claim reward. Please try again.",
          variant: "destructive",
        });
        return null;
      }

      if (data.error) {
        toast({
          title: "Cannot claim",
          description: data.error,
          variant: "destructive",
        });
        return null;
      }

      // Update local state with server response
      setClaims(prev => [...prev, {
        day_number: day,
        credits_awarded: data.creditsAwarded,
        claimed_at: new Date().toISOString(),
      }]);

      if (data.getsVip) {
        setVipStatus({ expires_at: data.vipExpiresAt });
        toast({
          title: "🌟 VIP Reward!",
          description: "You received 15 days of VIP status! (20 credits/day)",
        });
        return -1; // Special return value for VIP
      }

      toast({
        title: "🎄 Advent Reward!",
        description: `You received ${data.creditsAwarded} credits!`,
      });

      return data.creditsAwarded;
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
