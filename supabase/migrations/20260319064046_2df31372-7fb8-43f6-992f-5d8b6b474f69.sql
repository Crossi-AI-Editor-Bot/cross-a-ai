ALTER TABLE public.vip_tiers ADD COLUMN IF NOT EXISTS croin_price integer NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS crossatrix_id text;