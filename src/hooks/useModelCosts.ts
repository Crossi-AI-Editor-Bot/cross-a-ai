import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface ModelCost {
  id: string;
  model_id: string;
  label: string;
  cost: number;
  enabled: boolean;
  vip_only: boolean;
}

export const useModelCosts = () => {
  const [modelCosts, setModelCosts] = useState<ModelCost[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchModelCosts = async () => {
    try {
      const { data, error } = await supabase
        .from("model_costs")
        .select("*")
        .order("cost", { ascending: false });

      if (error) throw error;
      setModelCosts(data || []);
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

    // Subscribe to real-time changes
    const channel = supabase
      .channel("model_costs_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "model_costs",
        },
        () => {
          fetchModelCosts();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { modelCosts, loading, refetch: fetchModelCosts };
};
