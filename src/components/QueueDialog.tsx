import { useEffect, useState } from "react";
import { ListOrdered, Loader2, CheckCircle2, XCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

interface QueueItem {
  id: string;
  kind: string;
  prompt: string;
  status: string;
  position: number;
  error: string | null;
  created_at: string;
}

const QueueDialog = () => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from("generation_queue")
      .select("id, kind, prompt, status, position, error, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    setItems((data as QueueItem[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (!open) return;
    load();
    let channel: any;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      channel = supabase
        .channel(`queue-dialog-${user.id}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "generation_queue", filter: `user_id=eq.${user.id}` },
          () => load(),
        )
        .subscribe();
    })();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [open]);

  const active = items.filter((i) => i.status === "queued" || i.status === "processing");

  const statusBadge = (item: QueueItem) => {
    switch (item.status) {
      case "done":
        return <Badge variant="default" className="gap-1"><CheckCircle2 className="w-3 h-3" /> Ready</Badge>;
      case "failed":
        return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" /> Failed</Badge>;
      case "processing":
        return <Badge variant="secondary" className="gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Processing</Badge>;
      default:
        return <Badge variant="outline" className="gap-1"><Clock className="w-3 h-3" /> Queued</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" title="Generation queue" className="relative">
          <ListOrdered className="w-4 h-4" />
          {active.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
              {active.length}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListOrdered className="w-5 h-5" /> Your Queue
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-3">
          {loading && items.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">Loading…</div>
          ) : items.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">
              No queued generations yet.
            </div>
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <div key={item.id} className="border border-border rounded-lg p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline" className="capitalize">{item.kind}</Badge>
                    {statusBadge(item)}
                  </div>
                  <p className="text-sm line-clamp-2">{item.prompt}</p>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {item.status === "queued" || item.status === "processing"
                        ? `Position #${item.position}`
                        : new Date(item.created_at).toLocaleString()}
                    </span>
                    {item.error && <span className="text-destructive truncate ml-2">{item.error}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default QueueDialog;