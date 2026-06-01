import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface MhKey {
  id: string;
  secret_name: string;
  category: 'video' | 'image' | 'audio' | null;
  enabled: boolean;
  last_402_at: string | null;
}

const MagicHourKeyManager = () => {
  const { toast } = useToast();
  const [keys, setKeys] = useState<MhKey[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data, error } = await supabase
      .from('magic_hour_keys' as any)
      .select('*')
      .order('secret_name');
    if (!error && data) setKeys(data as any);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const update = async (id: string, patch: Partial<MhKey>) => {
    const { error } = await supabase.from('magic_hour_keys' as any).update(patch as any).eq('id', id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else load();
  };

  if (loading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><KeyRound className="w-5 h-5" /> Magic Hour API Keys</CardTitle>
        <CardDescription>Enable/disable keys and assign each to a category. When a key returns 402, the next is tried automatically.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {keys.map((k) => (
            <div key={k.id} className="flex items-center gap-3 p-3 rounded-lg border">
              <span className="font-mono text-sm w-12">{k.secret_name}</span>
              <Select value={k.category ?? '__none'} onValueChange={(v) => update(k.id, { category: v === '__none' ? null : (v as any) })}>
                <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Unassigned</SelectItem>
                  <SelectItem value="image">Image</SelectItem>
                  <SelectItem value="video">Video</SelectItem>
                  <SelectItem value="audio">Audio</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-xs text-muted-foreground">
                  {k.last_402_at ? `Last 402: ${new Date(k.last_402_at).toLocaleString()}` : 'No 402s yet'}
                </span>
                <Switch checked={k.enabled} onCheckedChange={(v) => update(k.id, { enabled: v })} />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default MagicHourKeyManager;