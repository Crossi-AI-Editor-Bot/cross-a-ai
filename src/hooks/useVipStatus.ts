import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type VipTier = 'copper' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond' | null;

// Tier hierarchy for comparison - upgrade path: copper → bronze → silver → gold → platinum → diamond
const TIER_LEVELS: Record<string, number> = {
  copper: 1,
  bronze: 2,
  silver: 3,
  gold: 4,
  platinum: 5,
  diamond: 6,
};

// Get the next tier in the upgrade path
export const getNextTier = (currentTier: VipTier): VipTier => {
  if (!currentTier) return 'copper';
  const tierOrder: VipTier[] = ['copper', 'bronze', 'silver', 'gold', 'platinum', 'diamond'];
  const currentIndex = tierOrder.indexOf(currentTier);
  if (currentIndex === -1 || currentIndex === tierOrder.length - 1) return null;
  return tierOrder[currentIndex + 1];
};

// Get the required tier to upgrade from
export const getRequiredTierFor = (targetTier: VipTier): VipTier => {
  if (!targetTier) return null;
  const tierOrder: VipTier[] = ['copper', 'bronze', 'silver', 'gold', 'platinum', 'diamond'];
  const targetIndex = tierOrder.indexOf(targetTier);
  if (targetIndex <= 0) return null; // copper has no requirement
  return tierOrder[targetIndex - 1];
};

export const useVipStatus = () => {
  const [tier, setTier] = useState<VipTier>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

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

        // Check if user is admin (admins get diamond access)
        const { data: adminData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .maybeSingle();

        if (adminData) {
          setIsAdmin(true);
          setTier('diamond'); // Admins get highest tier
          setLoading(false);
          return;
        }

        // Check for active VIP status with tier
        const { data: vipData } = await supabase
          .from("vip_status")
          .select("tier, expires_at")
          .eq("user_id", user.id)
          .gt("expires_at", new Date().toISOString())
          .maybeSingle();

        if (vipData) {
          setTier(vipData.tier as VipTier);
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

    checkVipStatus();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkVipStatus();
    });

    return () => subscription.unsubscribe();
  }, []);

  // Helper to check if user has access to a specific tier level
  const hasTierAccess = (requiredTier: VipTier): boolean => {
    if (isAdmin) return true;
    if (!tier || !requiredTier) return false;
    return TIER_LEVELS[tier] >= TIER_LEVELS[requiredTier];
  };

  // Legacy compatibility
  const isVip = tier !== null || isAdmin;

  return { tier, isVip, isAdmin, loading, hasTierAccess };
};
