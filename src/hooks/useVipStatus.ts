import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useVipTiers } from "@/hooks/useVipTiers";

export type VipTier = string | null;

export const useVipStatus = () => {
  const [tier, setTier] = useState<VipTier>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const { tiers, loading: tiersLoading } = useVipTiers();

  useEffect(() => {
    const checkVipStatus = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          setTier(null);
          setIsAdmin(false);
          setLoading(false);
          return;
        }

        const { data: adminData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .maybeSingle();

        if (adminData) {
          setIsAdmin(true);
          // Admins must purchase VIP like everyone else - check their vip_status
        }

        const { data: vipData } = await supabase
          .from("vip_status")
          .select("tier, expires_at")
          .eq("user_id", user.id)
          .gt("expires_at", new Date().toISOString())
          .maybeSingle();

        if (vipData) {
          setTier(vipData.tier as string);
        } else {
          setTier(null);
        }
      } catch (error) {
        console.error("Error checking VIP status:", error);
        setTier(null);
      } finally {
        setLoading(false);
      }
    };

    if (!tiersLoading) {
      checkVipStatus();
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      if (!tiersLoading) checkVipStatus();
    });

    return () => subscription.unsubscribe();
  }, [tiers, tiersLoading]);

  const hasTierAccess = (requiredTier: string): boolean => {
    if (!tier || !requiredTier) return false;
    const tierOrder = tiers.map(t => t.name);
    const currentLevel = tierOrder.indexOf(tier);
    const requiredLevel = tierOrder.indexOf(requiredTier);
    if (currentLevel === -1 || requiredLevel === -1) return false;
    return currentLevel >= requiredLevel;
  };

  const isVip = tier !== null || isAdmin;

  return { tier, isVip, isAdmin, loading: loading || tiersLoading, hasTierAccess };
};

// Legacy exports for compatibility
export const getNextTier = (currentTier: VipTier): VipTier => {
  // This is now handled by useVipTiers hook
  return null;
};

export const getRequiredTierFor = (targetTier: VipTier): VipTier => {
  // This is now handled by useVipTiers hook
  return null;
};
