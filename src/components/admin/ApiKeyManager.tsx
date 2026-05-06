import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Copy, Trash2, Key } from "lucide-react";

interface ApiKey {
  id: string;
  key: string;
  label: string;
  enabled: boolean;
  created_at: string;
}

const FN_BASE = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/public-api`;

export default function ApiKeyManager() {
  const { toast } = useToast();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("api_keys" as any).select("*").order("created_at", { ascending: false });
    setKeys((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const generate = async () => {
    const key = `cax_${crypto.randomUUID().replace(/-/g, "")}`;
    const { error } = await supabase.from("api_keys" as any).insert({ key, label: label || "External API" } as any);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    setLabel("");
    toast({ title: "API key created" });
    load();
  };

  const toggle = async (id: string, enabled: boolean) => {
    await supabase.from("api_keys" as any).update({ enabled } as any).eq("id", id);
    load();
  };

  const remove = async (id: string) => {
    await supabase.from("api_keys" as any).delete().eq("id", id);
    load();
  };

  const copy = (txt: string) => {
    navigator.clipboard.writeText(txt);
    toast({ title: "Copied" });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Key className="w-5 h-5" /> External API Keys</CardTitle>
        <CardDescription>
          Use: <code className="text-xs break-all">{FN_BASE}?key=API_KEY&model=Model_Label&prompt=Hello</code>
          <br />Replace spaces in model name with <code>_</code>. Unlimited usage.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1">
            <Label htmlFor="lbl" className="sr-only">Label</Label>
            <Input id="lbl" placeholder="Label (e.g. My Website)" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <Button onClick={generate}>Generate Key</Button>
        </div>

        {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">No keys yet.</p>
        ) : (
          <div className="space-y-2">
            {keys.map((k) => (
              <div key={k.id} className="flex flex-col sm:flex-row sm:items-center gap-2 p-3 border border-border rounded-md">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{k.label}</p>
                  <p className="text-xs font-mono text-muted-foreground break-all">{k.key}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={k.enabled} onCheckedChange={(v) => toggle(k.id, v)} />
                  <Button size="icon" variant="ghost" onClick={() => copy(k.key)}><Copy className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(k.id)}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
