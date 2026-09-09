import { supabase } from "@/integrations/supabase/client";
import { useVipTiers } from "@/hooks/useVipTiers";
import { adminStore } from "@/hooks/useIsAdmin";
import { getUserId } from "@/lib/authUser";
import { createSharedStore } from "@/lib/sharedStore";

export type VipTier = string | null;

type VipState = { tier: VipTier; dynamicModelIds: string[] };

const vipStore = createSharedStore<VipState>(async () => {
  const userId = await getUserId();
  if (!userId) return { tier: null, dynamicModelIds: [] };

  const { data: vipData } = await supabase
    .from("vip_status")
    .select("tier, expires_at, dynamic_model_ids")
    .eq("user_id", userId)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  return vipData
    ? { tier: vipData.tier as string, dynamicModelIds: ((vipData as any).dynamic_model_ids as string[]) || [] }
    : { tier: null, dynamicModelIds: [] };
}, { tier: null, dynamicModelIds: [] }, { ttlMs: 5 * 60_000 });

export const useVipStatus = () => {
  const { tiers, loading: tiersLoading } = useVipTiers();
  const { value, loading } = vipStore.useStore();
  const { value: isAdmin } = adminStore.useStore();

  const tier = value.tier;
  const currentTierConfig = tier ? tiers.find((t) => t.name === tier) : null;
  const isUnlimited = !!(currentTierConfig as any)?.unlimited;
  const isDynamic = !!(currentTierConfig as any)?.is_dynamic;
  const topupDiscountPercent = Number((currentTierConfig as any)?.topup_discount_percent ?? 10);

  const hasTierAccess = (requiredTier: string): boolean => {
    if (!tier || !requiredTier) return false;
    const tierOrder = tiers.map((t) => t.name);
    const currentLevel = tierOrder.indexOf(tier);
    const requiredLevel = tierOrder.indexOf(requiredTier);
    if (currentLevel === -1 || requiredLevel === -1) return false;
    return currentLevel >= requiredLevel;
  };

  return {
    tier,
    isVip: tier !== null,
    isAdmin,
    isUnlimited,
    isDynamic,
    dynamicModelIds: value.dynamicModelIds,
    topupDiscountPercent,
    loading: loading || tiersLoading,
    hasTierAccess,
  };
};

// Legacy exports for compatibility
export const getNextTier = (currentTier: VipTier): VipTier => null;

export const getRequiredTierFor = (targetTier: VipTier): VipTier => null;
