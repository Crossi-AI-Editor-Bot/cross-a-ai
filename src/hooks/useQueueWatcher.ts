import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/**
 * Subscribes to the user's generation_queue rows and shows a toast when
 * a queued generation completes. The result is also auto-posted as an
 * assistant message by the queue-worker function.
 */
export const useQueueWatcher = (onDone?: () => void) => {
  const { toast } = useToast();

  useEffect(() => {
    let unsub = () => {};
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const channel = supabase
        .channel(`queue-${user.id}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'generation_queue', filter: `user_id=eq.${user.id}` },
          (payload) => {
            const row: any = payload.new;
            if (row.status === 'done') {
              toast({ title: 'Queued generation ready', description: 'Your result has been posted to the chat.' });
              onDone?.();
            } else if (row.status === 'failed') {
              toast({ title: 'Queued generation failed', description: row.error || 'Unknown error', variant: 'destructive' });
            }
          })
        .subscribe();
      unsub = () => { supabase.removeChannel(channel); };
    })();
    return () => unsub();
  }, [onDone, toast]);
};