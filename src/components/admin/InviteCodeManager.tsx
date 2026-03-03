import { useState } from "react";
import { Copy, Plus, Trash2, Ticket, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useVipTiers } from "@/hooks/useVipTiers";

const generateCode = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 12; i++) {
    if (i > 0 && i % 4 === 0) code += "-";
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
};

const InviteCodeManager = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { tiers } = useVipTiers();
  const [selectedTier, setSelectedTier] = useState<string>("");
  const [codeCount, setCodeCount] = useState(1);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: codes = [], isLoading } = useQuery({
    queryKey: ["invite-codes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vip_invite_codes" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const createCodes = useMutation({
    mutationFn: async ({ tier, count }: { tier: string; count: number }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const newCodes = Array.from({ length: count }, () => ({
        code: generateCode(),
        tier_name: tier,
        created_by: user.id,
      }));

      const { error } = await supabase
        .from("vip_invite_codes" as any)
        .insert(newCodes as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invite-codes"] });
      toast({ title: "Codes created", description: `${codeCount} invite code(s) generated.` });
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  const deleteCode = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("vip_invite_codes" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invite-codes"] }),
  });

  const handleCopy = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const unusedCodes = codes.filter((c: any) => !c.used_by);
  const usedCodes = codes.filter((c: any) => c.used_by);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ticket className="w-5 h-5" />
          Invite Codes
        </CardTitle>
        <CardDescription>Generate single-use invite codes for VIP tiers</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Generate section */}
        <div className="flex flex-col sm:flex-row gap-2">
          <Select value={selectedTier} onValueChange={setSelectedTier}>
            <SelectTrigger className="h-9 text-sm flex-1">
              <SelectValue placeholder="Select tier" />
            </SelectTrigger>
            <SelectContent>
              {tiers.map((t) => (
                <SelectItem key={t.name} value={t.name}>
                  {t.display_name} {(t as any).hidden ? "(Hidden)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            min={1}
            max={50}
            value={codeCount}
            onChange={(e) => setCodeCount(Math.min(50, Math.max(1, parseInt(e.target.value) || 1)))}
            className="h-9 text-sm w-20"
            placeholder="Count"
          />
          <Button
            size="sm"
            onClick={() => createCodes.mutate({ tier: selectedTier, count: codeCount })}
            disabled={!selectedTier || createCodes.isPending}
          >
            <Plus className="w-4 h-4 mr-1" />
            Generate
          </Button>
        </div>

        {/* Unused codes */}
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Available ({unusedCodes.length})
              </p>
              {unusedCodes.length === 0 && (
                <p className="text-sm text-muted-foreground py-2">No codes generated yet.</p>
              )}
              {unusedCodes.map((c: any) => {
                const tierConfig = tiers.find((t) => t.name === c.tier_name);
                return (
                  <div key={c.id} className="flex items-center gap-2 p-2 rounded border bg-muted/20 text-sm">
                    <code className="font-mono flex-1">{c.code}</code>
                    <Badge variant="outline" className="text-xs capitalize">
                      {tierConfig?.display_name || c.tier_name}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleCopy(c.code, c.id)}
                    >
                      {copiedId === c.id ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => deleteCode.mutate(c.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>

            {usedCodes.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Used ({usedCodes.length})
                </p>
                {usedCodes.map((c: any) => {
                  const tierConfig = tiers.find((t) => t.name === c.tier_name);
                  return (
                    <div key={c.id} className="flex items-center gap-2 p-2 rounded border bg-muted/10 text-sm opacity-60">
                      <code className="font-mono flex-1 line-through">{c.code}</code>
                      <Badge variant="secondary" className="text-xs capitalize">
                        {tierConfig?.display_name || c.tier_name}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(c.used_at).toLocaleDateString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default InviteCodeManager;
