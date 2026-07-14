import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface ModelCost {
  id: string;
  model_id: string;
  label: string;
  cost: number;
  enabled: boolean;
  public_access: boolean;
  image_cost: number;
  video_credits_per_second: number;
  audio_credits_per_second: number;
  folder: string | null;
  system_prompt: string | null;
  is_fake: boolean;
  fake_error_message: string | null;
  fake_corrupted_output: boolean;
  max_tool_calls: number;
  tool_switchmodel: boolean;
  tool_croins: boolean;
  tool_vip: boolean;
  tool_credits: boolean;
  tool_email: boolean;
  tool_shares: boolean;
  tool_ccvideo: boolean;
  tool_ccpost: boolean;
  tool_ccsong: boolean;
  tool_ccstream: boolean;
  // Dynamic tier access map: { copper: true, bronze: false, ... }
  tier_access: Record<string, boolean>;
}

export const useModelCosts = () => {
  const [modelCosts, setModelCosts] = useState<ModelCost[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchModelCosts = async () => {
    try {
      const [modelsRes, accessRes] = await Promise.all([
        supabase
          .from("model_costs")
          .select("id, model_id, label, cost, enabled, public_access, image_cost, video_credits_per_second, audio_credits_per_second, folder, system_prompt, is_fake, fake_error_message, fake_corrupted_output, max_tool_calls, tool_switchmodel, tool_croins, tool_vip, tool_credits, tool_email, tool_shares, tool_ccvideo, tool_ccpost, tool_ccsong, tool_ccstream")
          .order("cost", { ascending: false }),
        supabase
          .from("model_tier_access" as any)
          .select("model_cost_id, tier_name, has_access"),
      ]);

      if (modelsRes.error) throw modelsRes.error;
      if (accessRes.error) throw accessRes.error;

      const accessMap = new Map<string, Record<string, boolean>>();
      for (const row of (accessRes.data || []) as any[]) {
        if (!accessMap.has(row.model_cost_id)) {
          accessMap.set(row.model_cost_id, {});
        }
        accessMap.get(row.model_cost_id)![row.tier_name] = row.has_access;
      }

      const models: ModelCost[] = (modelsRes.data || []).map((m: any) => ({
        id: m.id,
        model_id: m.model_id,
        label: m.label,
        cost: m.cost,
        enabled: m.enabled,
        public_access: m.public_access,
        image_cost: m.image_cost || 0,
        video_credits_per_second: Number(m.video_credits_per_second ?? 1),
        audio_credits_per_second: Number(m.audio_credits_per_second ?? 1),
        folder: m.folder,
        system_prompt: m.system_prompt,
        is_fake: !!m.is_fake,
        fake_error_message: m.fake_error_message ?? null,
        fake_corrupted_output: !!m.fake_corrupted_output,
        max_tool_calls: Number(m.max_tool_calls ?? 3),
        tool_switchmodel: !!m.tool_switchmodel,
        tool_croins: !!m.tool_croins,
        tool_vip: !!m.tool_vip,
        tool_credits: !!m.tool_credits,
        tool_email: !!m.tool_email,
        tool_shares: !!m.tool_shares,
        tool_ccvideo: !!m.tool_ccvideo,
        tool_ccpost: !!m.tool_ccpost,
        tool_ccsong: !!m.tool_ccsong,
        tool_ccstream: !!m.tool_ccstream,
        tier_access: accessMap.get(m.id) || {},
      }));

      setModelCosts(models);
    } catch (error) {
      console.error("Error fetching model costs:", error);
      toast({
        title: "Error",
        description: "Failed to load model costs",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModelCosts();

    const channel = supabase
      .channel("model_costs_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "model_costs" },
        () => fetchModelCosts()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "model_tier_access" },
        () => fetchModelCosts()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { modelCosts, loading, refetch: fetchModelCosts };
};
