
ALTER TABLE public.vip_tiers
  ADD COLUMN IF NOT EXISTS is_dynamic boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS topup_discount_percent numeric NOT NULL DEFAULT 10;

ALTER TABLE public.vip_status
  ADD COLUMN IF NOT EXISTS dynamic_ceiling_tier text,
  ADD COLUMN IF NOT EXISTS dynamic_model_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];
