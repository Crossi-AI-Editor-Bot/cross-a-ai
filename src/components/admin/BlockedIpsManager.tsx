import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Shield, Trash2, AlertTriangle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface BlockedIp {
  id: string;
  ip_address: string;
  reason: string | null;
  blocked_at: string;
}

interface JailbreakAttempt {
  id: string;
  ip_address: string;
  user_id: string | null;
  prompt_snippet: string | null;
  created_at: string;
}

const BlockedIpsManager = () => {
  const [blockedIps, setBlockedIps] = useState<BlockedIp[]>([]);
  const [attempts, setAttempts] = useState<JailbreakAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const loadData = async () => {
    setLoading(true);
    const [ipsRes, attemptsRes] = await Promise.all([
      supabase.from("blocked_ips").select("*").order("blocked_at", { ascending: false }),
      supabase.from("jailbreak_attempts").select("*").order("created_at", { ascending: false }).limit(100),
    ]);
    if (ipsRes.data) setBlockedIps(ipsRes.data);
    if (attemptsRes.data) setAttempts(attemptsRes.data);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleUnblock = async (id: string, ip: string) => {
    const { error } = await supabase.from("blocked_ips").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: "Failed to unblock IP", variant: "destructive" });
    } else {
      setBlockedIps((prev) => prev.filter((b) => b.id !== id));
      toast({ title: "IP Unblocked", description: `${ip} has been unblocked.` });
    }
  };

  const handleClearAttempts = async () => {
    const ids = attempts.map((a) => a.id);
    if (ids.length === 0) return;
    const { error } = await supabase.from("jailbreak_attempts").delete().in("id", ids);
    if (error) {
      toast({ title: "Error", description: "Failed to clear attempts", variant: "destructive" });
    } else {
      setAttempts([]);
      toast({ title: "Cleared", description: "All jailbreak attempts cleared." });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Security - IP Bans & Jailbreak Attempts
        </CardTitle>
        <CardDescription>Manage blocked IPs and review jailbreak attempt logs</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="blocked" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="blocked" className="flex-1">
              Blocked IPs ({blockedIps.length})
            </TabsTrigger>
            <TabsTrigger value="attempts" className="flex-1">
              Jailbreak Attempts ({attempts.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="blocked" className="mt-4">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : blockedIps.length === 0 ? (
              <p className="text-sm text-muted-foreground">No blocked IPs.</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {blockedIps.map((ip) => (
                  <div key={ip.id} className="flex items-center justify-between p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                    <div>
                      <p className="font-mono text-sm font-medium">{ip.ip_address}</p>
                      <p className="text-xs text-muted-foreground">
                        {ip.reason || "jailbreak_attempts"} · {new Date(ip.blocked_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => handleUnblock(ip.id, ip.ip_address)}>
                      <Trash2 className="h-3 w-3 mr-1" /> Unblock
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="attempts" className="mt-4">
            <div className="flex justify-end mb-2">
              <Button variant="outline" size="sm" onClick={handleClearAttempts} disabled={attempts.length === 0}>
                Clear All
              </Button>
            </div>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : attempts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No jailbreak attempts logged.</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {attempts.map((a) => (
                  <div key={a.id} className="p-3 rounded-lg bg-muted/50 border">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle className="h-3 w-3 text-yellow-500" />
                      <span className="font-mono text-xs">{a.ip_address}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(a.created_at).toLocaleString()}
                      </span>
                    </div>
                    {a.prompt_snippet && (
                      <p className="text-xs text-muted-foreground truncate max-w-full">
                        {a.prompt_snippet}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default BlockedIpsManager;
