import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface VipTierConfig {
  id: string;
  name: string;
  display_name: string;
  daily_credits: number;
  sort_order: number;
  color: string;
  icon_name: string;
  gradient_from: string;
  gradient_to: string;
  text_color: string;
  bg_color: string;
  hidden: boolean;
  unlimited?: boolean;
  is_dynamic?: boolean;
  topup_discount_percent?: number;
  created_at: string;
  updated_at: string;
}

export const useVipTiers = () => {
  const queryClient = useQueryClient();

  const { data: tiers = [], isLoading: loading } = useQuery({
    queryKey: ["vip-tiers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vip_tiers" as any)
        .select("*")
        .order("sort_order", { ascending: true });

      if (error) throw error;
      return (data as any[]) as VipTierConfig[];
    },
  });

  const createTier = useMutation({
    mutationFn: async (tier: Omit<VipTierConfig, "id" | "created_at" | "updated_at">) => {
      const { data, error } = await supabase
        .from("vip_tiers" as any)
        .insert(tier as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as VipTierConfig;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["vip-tiers"] }),
  });

  const updateTier = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<VipTierConfig> & { id: string }) => {
      const { error } = await supabase
        .from("vip_tiers" as any)
        .update(updates as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["vip-tiers"] }),
  });

  const deleteTier = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("vip_tiers" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["vip-tiers"] }),
  });

  // Helper to get tier names in order
  const tierNames = tiers.map((t) => t.name);

  // Get next tier in upgrade path
  const getNextTier = (currentTier: string | null): string | null => {
    if (!currentTier) return tierNames[0] || null;
    const idx = tierNames.indexOf(currentTier);
    if (idx === -1 || idx === tierNames.length - 1) return null;
    return tierNames[idx + 1];
  };

  // Get required tier for upgrade
  const getRequiredTierFor = (targetTier: string): string | null => {
    const idx = tierNames.indexOf(targetTier);
    if (idx <= 0) return null;
    return tierNames[idx - 1];
  };

  // Get tier config by name
  const getTierConfig = (name: string): VipTierConfig | undefined => {
    return tiers.find((t) => t.name === name);
  };

  return {
    tiers,
    loading,
    tierNames,
    createTier,
    updateTier,
    deleteTier,
    getNextTier,
    getRequiredTierFor,
    getTierConfig,
  };
};
