-- Create VIP tier enum
CREATE TYPE public.vip_tier AS ENUM ('bronze', 'silver', 'gold', 'diamond');

-- Add tier column to vip_status table
ALTER TABLE public.vip_status 
ADD COLUMN tier vip_tier NOT NULL DEFAULT 'bronze';

-- Add tier-based access columns to model_costs
ALTER TABLE public.model_costs
ADD COLUMN public_access boolean NOT NULL DEFAULT true,
ADD COLUMN bronze_access boolean NOT NULL DEFAULT true,
ADD COLUMN silver_access boolean NOT NULL DEFAULT true,
ADD COLUMN gold_access boolean NOT NULL DEFAULT true,
ADD COLUMN diamond_access boolean NOT NULL DEFAULT true;

-- Migrate existing vip_only data:
-- vip_only = true means VIP only -> public_access = false, all VIP tiers = true
-- vip_only = false means everyone -> public_access = true, all VIP tiers = true
UPDATE public.model_costs
SET public_access = NOT vip_only,
    bronze_access = true,
    silver_access = true,
    gold_access = true,
    diamond_access = true;

-- Drop the old vip_only column
ALTER TABLE public.model_costs DROP COLUMN vip_only;