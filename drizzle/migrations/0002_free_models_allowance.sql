ALTER TABLE public.model_costs ADD COLUMN IF NOT EXISTS is_free boolean NOT NULL DEFAULT false;
ALTER TABLE public.model_costs ADD COLUMN IF NOT EXISTS free_tokens_per_percent integer NOT NULL DEFAULT 1000;
ALTER TABLE public.model_costs ADD COLUMN IF NOT EXISTS free_reset_time_utc text NOT NULL DEFAULT '00:00';

CREATE TABLE public.user_free_model_usage (
  user_id uuid NOT NULL,
  model_cost_id uuid NOT NULL REFERENCES public.model_costs(id) ON DELETE CASCADE,
  tokens_used bigint NOT NULL DEFAULT 0,
  period_start timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, model_cost_id)
);
GRANT SELECT ON public.user_free_model_usage TO authenticated;
GRANT ALL ON public.user_free_model_usage TO service_role;
ALTER TABLE public.user_free_model_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own free usage" ON public.user_free_model_usage FOR SELECT TO authenticated USING (auth.uid() = user_id);