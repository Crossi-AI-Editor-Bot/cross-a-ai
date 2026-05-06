ALTER TABLE public.vip_tiers ADD COLUMN IF NOT EXISTS unlimited boolean NOT NULL DEFAULT false;
UPDATE public.vip_tiers SET unlimited = true WHERE name = 'unlimited_';