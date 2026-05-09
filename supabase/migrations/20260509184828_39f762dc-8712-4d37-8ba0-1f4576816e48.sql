ALTER TABLE public.model_costs
  ADD COLUMN IF NOT EXISTS is_fake boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fake_error_message text;