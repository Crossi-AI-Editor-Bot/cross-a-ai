import { useEffect, useState } from "react";
import { Bot } from "lucide-react";
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
import { Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { ModelCost } from "@/hooks/useModelCosts";
import type { VipTierConfig } from "@/hooks/useVipTiers";

interface DefaultModelManagerProps {
  models: ModelCost[];
  tiers: VipTierConfig[];
}

type DefaultModelsMap = Record<string, string>; // tier_name -> model_cost_id, "public" for free users

const DefaultModelManager = ({ models, tiers }: DefaultModelManagerProps) => {
  const { toast } = useToast();
  const [defaults, setDefaults] = useState<DefaultModelsMap>({});
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Only show enabled, non-call models
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
      setLoaded(true);
    };
    load();
  }, []);

  const handleSave = async () => {
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

  if (!loaded) return null;

  return (
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
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-1" />
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Free / Public users */}
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
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Per VIP tier */}
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
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default DefaultModelManager;
