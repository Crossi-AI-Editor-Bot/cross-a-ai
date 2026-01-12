-- Add new VIP tiers: copper and platinum
-- Note: PostgreSQL doesn't allow easy enum modification, so we need to recreate with new values

-- First, add the new enum values
ALTER TYPE public.vip_tier ADD VALUE IF NOT EXISTS 'copper' BEFORE 'bronze';
ALTER TYPE public.vip_tier ADD VALUE IF NOT EXISTS 'platinum' AFTER 'gold';
ALTER TYPE public.vip_tier ADD VALUE IF NOT EXISTS 'emerald' BEFORE 'diamond';

-- Add user_message column to vip_requests for users to explain their request
ALTER TABLE public.vip_requests 
ADD COLUMN IF NOT EXISTS user_message text;