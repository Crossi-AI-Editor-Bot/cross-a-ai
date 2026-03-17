import { useEffect, useState } from "react";
import { BookOpen, ImageOff, Save } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

const GlobalPromptManager = () => {
  const { toast } = useToast();
  const [extraKnowledge, setExtraKnowledge] = useState("");
  const [imageRestrictions, setImageRestrictions] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const load = async () => {
      const [knowledgeRes, restrictionsRes] = await Promise.all([
        supabase.from("site_settings").select("value").eq("key", "global_extra_knowledge").maybeSingle(),
        supabase.from("site_settings").select("value").eq("key", "global_image_restrictions").maybeSingle(),
      ]);

      if (knowledgeRes.data?.value) {
        setExtraKnowledge(typeof knowledgeRes.data.value === "string" ? knowledgeRes.data.value : (knowledgeRes.data.value as any).text || "");
      }
      if (restrictionsRes.data?.value) {
        setImageRestrictions(typeof restrictionsRes.data.value === "string" ? restrictionsRes.data.value : (restrictionsRes.data.value as any).text || "");
      }
      setLoaded(true);
    };
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const [{ error: e1 }, { error: e2 }] = await Promise.all([
        supabase.from("site_settings").upsert(
          { key: "global_extra_knowledge", value: { text: extraKnowledge } as any },
          { onConflict: "key" }
        ),
        supabase.from("site_settings").upsert(
          { key: "global_image_restrictions", value: { text: imageRestrictions } as any },
          { onConflict: "key" }
        ),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      toast({ title: "Saved", description: "Global prompts saved successfully." });
    } catch (error) {
      console.error("Error saving global prompts:", error);
      toast({ title: "Error", description: "Failed to save global prompts.", variant: "destructive" });
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
              <BookOpen className="w-5 h-5" />
              Global Model Instructions
            </CardTitle>
            <CardDescription>
              Add extra knowledge to all text models and restrictions for image models
            </CardDescription>
          </div>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="w-4 h-4 mr-1" />
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-sm font-medium">
            <BookOpen className="w-4 h-4 text-primary" />
            Extra Knowledge (all text models)
          </Label>
          <Textarea
            value={extraKnowledge}
            onChange={(e) => setExtraKnowledge(e.target.value)}
            placeholder="Add extra context or knowledge that will be appended to every text model's system prompt. E.g. company info, guidelines, facts..."
            className="min-h-[100px] text-sm"
          />
          <p className="text-xs text-muted-foreground">
            This text is appended to the system prompt of every text model.
          </p>
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-sm font-medium">
            <ImageOff className="w-4 h-4 text-destructive" />
            Image Model Restrictions
          </Label>
          <Textarea
            value={imageRestrictions}
            onChange={(e) => setImageRestrictions(e.target.value)}
            placeholder="Add restrictions for image models. E.g. 'Do not generate NSFW content, violence, or copyrighted characters...'"
            className="min-h-[100px] text-sm"
          />
          <p className="text-xs text-muted-foreground">
            This text is prepended to image generation prompts as restrictions.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default GlobalPromptManager;
