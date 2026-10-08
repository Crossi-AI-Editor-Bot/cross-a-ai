-- lovable-cron-fallback-reviewed: queue retry every 3 min (user requirement), armed only on enqueue and unscheduled after the queue drains
CREATE OR REPLACE FUNCTION public.ensure_queue_worker_scheduled()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, cron AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'queue-worker-every-3min') THEN
    PERFORM cron.schedule('queue-worker-every-3min', '*/3 * * * *', $cmd$
  SELECT net.http_post(
    url := 'https://hqibtbdovjcocqgwqwbw.supabase.co/functions/v1/queue-worker',
    headers := jsonb_build_object('Content-Type','application/json','apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhxaWJ0YmRvdmpjb2NxZ3dxd2J3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMwMzU2NzUsImV4cCI6MjA3ODYxMTY3NX0.FDlDFGJCwlVCyErS_JLZkLVEplNX_5OWMeJsEYSsNhc'),
    body := '{}'::jsonb
  );
$cmd$);
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.stop_queue_worker_if_idle()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, cron AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.generation_queue WHERE status IN ('queued','processing')) THEN
    RETURN false;
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'queue-worker-every-3min') THEN
    PERFORM cron.unschedule('queue-worker-every-3min');
  END IF;
  RETURN true;
END; $$;

REVOKE ALL ON FUNCTION public.ensure_queue_worker_scheduled() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stop_queue_worker_if_idle() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_queue_worker_scheduled() TO service_role;
GRANT EXECUTE ON FUNCTION public.stop_queue_worker_if_idle() TO service_role;

CREATE OR REPLACE FUNCTION public.trg_generation_queue_wake()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.ensure_queue_worker_scheduled();
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.trg_generation_queue_wake() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS generation_queue_wake ON public.generation_queue;
CREATE TRIGGER generation_queue_wake AFTER INSERT ON public.generation_queue
FOR EACH ROW EXECUTE FUNCTION public.trg_generation_queue_wake();

SELECT public.stop_queue_worker_if_idle();