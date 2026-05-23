import { useEffect, useState } from "react";
import { Bot, Save, Video, Music } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { ModelCost } from "@/hooks/useModelCosts";
import type { VipTierConfig } from "@/hooks/useVipTiers";

interface DefaultModelManagerProps {
  models: ModelCost[];
  tiers: VipTierConfig[];
}

type DefaultModelsMap = Record<string, string>;

const DefaultModelManager = ({ models, tiers }: DefaultModelManagerProps) => {
  const { toast } = useToast();
  const [defaults, setDefaults] = useState<DefaultModelsMap>({});
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  
  // Zustand für die Bearbeitung der Credit-Kosten pro Sekunde
  const [modelCostsState, setModelCostsState] = useState<Record<string, { video: number; audio: number }>>({});

  const selectableModels = models.filter(
    (m) => m.enabled && m.folder !== "Call Models"
  );

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "default_models")
        .maybeSingle();

      if (data?.value && typeof data.value === "object") {
        setDefaults(data.value as DefaultModelsMap);
      }

      // Initialisiere den lokalen State für Sekundekosten aus den Props
      const costMap: Record<string, { video: number; audio: number }> = {};
      models.forEach((m) => {
        costMap[m.id] = {
          video: (m as any).video_credits_per_second ?? 1.0,
          audio: (m as any).audio_credits_per_second ?? 1.0,
        };
      });
      setModelCostsState(costMap);
      setLoaded(true);
    };
    load();
  }, [models]);

  const handleSaveDefaults = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("site_settings")
        .upsert(
          { key: "default_models", value: defaults as any },
          { onConflict: "key" }
        );
      if (error) throw error;
      toast({ title: "Saved", description: "Default model settings saved." });
    } catch (error) {
      console.error("Error saving default models:", error);
      toast({ title: "Error", description: "Failed to save defaults.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveModelCosts = async (modelId: string) => {
    const costs = modelCostsState[modelId];
    if (!costs) return;

    try {
      const { error } = await supabase
        .from("model_costs")
        .update({
          video_credits_per_second: costs.video,
          audio_credits_per_second: costs.audio,
        })
        .eq("id", modelId);

      if (error) throw error;
      toast({ title: "Costs Updated", description: "Media generation multiplier updated successfully." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  if (!loaded) return null;

  return (
    <div className="space-y-6">
      {/* 1. Standard-Modelle Einstellungen */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bot className="w-5 h-5" />
                Default Model Settings
              </CardTitle>
              <CardDescription>
                Set which model loads by default for free users and each VIP tier
              </CardDescription>
            </div>
            <Button size="sm" onClick={handleSaveDefaults} disabled={saving}>
              <Save className="w-4 h-4 mr-1" />
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Free Users</Label>
              <Select
                value={defaults["public"] || ""}
                onValueChange={(v) => setDefaults((prev) => ({ ...prev, public: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select default model" />
                </SelectTrigger>
                <SelectContent>
                  {selectableModels.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label || m.model_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {tiers.map((tier) => (
              <div key={tier.id} className="space-y-1.5">
                <Label className="text-sm font-medium">{tier.display_name}</Label>
                <Select
                  value={defaults[tier.name] || ""}
                  onValueChange={(v) =>
                    setDefaults((prev) => ({ ...prev, [tier.name]: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select default model" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectableModels.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label || m.model_id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 2. Magic Hour Media Credits Sekundengenaue Kostenverwaltung */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video className="w-5 h-5" />
            Media Credit Costs (Per Second)
          </CardTitle>
          <CardDescription>
            Configure how many specific credits are deducted per second of generation for Video or Audio models (e.g. Magic Hour).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {selectableModels.map((m) => {
              const current = modelCostsState[m.id] || { video: 1.0, audio: 1.0 };
              return (
                <div key={m.id} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 border rounded-lg gap-4 bg-muted/20">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{m.label || m.model_id}</p>
                    <p className="text-xs text-muted-foreground font-mono break-all">{m.model_id}</p>
                  </div>
                  
                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    <div className="flex items-center gap-1">
                      <Video className="w-3.5 h-3.5 text-blue-500" />
                      <Input
                        type="number"
                        step="0.1"
                        value={current.video}
                        onChange={(e) => setModelCostsState({
                          ...modelCostsState,
                          [m.id]: { ...current, video: parseFloat(e.target.value) || 0 }
                        })}
                        className="w-20 h-8 text-xs"
                        placeholder="Video/s"
                      />
                    </div>

                    <div className="flex items-center gap-1">
                      <Music className="w-3.5 h-3.5 text-purple-500" />
                      <Input
                        type="number"
                        step="0.1"
                        value={current.audio}
                        onChange={(e) => setModelCostsState({
                          ...modelCostsState,
                          [m.id]: { ...current, audio: parseFloat(e.target.value) || 0 }
                        })}
                        className="w-20 h-8 text-xs"
                        placeholder="Audio/s"
                      />
                    </div>

                    <Button size="sm" variant="outline" className="h-8" onClick={() => handleSaveModelCosts(m.id)}>
                      <Save className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DefaultModelManager;
