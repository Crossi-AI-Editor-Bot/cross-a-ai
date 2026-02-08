
-- Create vip_tiers configuration table
CREATE TABLE public.vip_tiers (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  display_name text NOT NULL,
  daily_credits integer NOT NULL DEFAULT 15,
  sort_order integer NOT NULL DEFAULT 0,
  color text NOT NULL DEFAULT 'gray',
  icon_name text NOT NULL DEFAULT 'Crown',
  gradient_from text NOT NULL DEFAULT 'from-gray-400',
  gradient_to text NOT NULL DEFAULT 'to-gray-300',
  text_color text NOT NULL DEFAULT 'text-gray-500',
  bg_color text NOT NULL DEFAULT 'bg-gray-100',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.vip_tiers ENABLE ROW LEVEL SECURITY;

-- Everyone can view tiers
CREATE POLICY "Anyone can view VIP tiers"
ON public.vip_tiers FOR SELECT
USING (true);

-- Only admins can manage tiers
CREATE POLICY "Admins can insert VIP tiers"
ON public.vip_tiers FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update VIP tiers"
ON public.vip_tiers FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete VIP tiers"
ON public.vip_tiers FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Seed with existing tiers
INSERT INTO public.vip_tiers (name, display_name, daily_credits, sort_order, color, icon_name, gradient_from, gradient_to, text_color, bg_color) VALUES
('copper', 'Copper', 16, 1, 'orange-700', 'Coins', 'from-orange-700', 'to-orange-500', 'text-orange-700', 'bg-orange-100'),
('bronze', 'Bronze', 18, 2, 'amber-700', 'Award', 'from-amber-700', 'to-amber-500', 'text-amber-700', 'bg-amber-100'),
('silver', 'Silver', 20, 3, 'slate-400', 'Star', 'from-slate-400', 'to-slate-300', 'text-slate-500', 'bg-slate-100'),
('gold', 'Gold', 22, 4, 'yellow-500', 'Crown', 'from-yellow-500', 'to-yellow-400', 'text-yellow-600', 'bg-yellow-100'),
('platinum', 'Platinum', 24, 5, 'purple-500', 'Hexagon', 'from-purple-500', 'to-purple-400', 'text-purple-600', 'bg-purple-100'),
('diamond', 'Diamond', 25, 6, 'cyan-400', 'Gem', 'from-cyan-400', 'to-blue-500', 'text-cyan-600', 'bg-cyan-100');

-- Change vip_status.tier from enum to text
ALTER TABLE public.vip_status ALTER COLUMN tier TYPE text USING tier::text;
ALTER TABLE public.vip_status ALTER COLUMN tier SET DEFAULT 'bronze';

-- Change vip_requests.requested_tier from enum to text
ALTER TABLE public.vip_requests ALTER COLUMN requested_tier TYPE text USING requested_tier::text;

-- Update reset_daily_credits to read from vip_tiers table
CREATE OR REPLACE FUNCTION public.reset_daily_credits(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  user_tier text;
  is_admin boolean;
  base_credits numeric;
  tier_credits integer;
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: Cannot reset credits for other users';
  END IF;
  
  SELECT public.has_role(p_user_id, 'admin') INTO is_admin;
  
  SELECT tier INTO user_tier
  FROM public.vip_status 
  WHERE user_id = p_user_id AND expires_at > now();
  
  IF is_admin THEN
    -- Admins get the highest tier credits
    SELECT COALESCE(MAX(daily_credits), 25) INTO base_credits FROM public.vip_tiers;
  ELSIF user_tier IS NOT NULL THEN
    SELECT daily_credits INTO tier_credits FROM public.vip_tiers WHERE name = user_tier;
    base_credits := COALESCE(tier_credits, 15);
  ELSE
    base_credits := 15;
  END IF;
  
  UPDATE public.user_credits
  SET credits = base_credits, last_reset_date = CURRENT_DATE
  WHERE user_id = p_user_id AND last_reset_date < CURRENT_DATE;
END;
$function$;

-- Add trigger for updated_at
CREATE TRIGGER update_vip_tiers_updated_at
BEFORE UPDATE ON public.vip_tiers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Drop the vip_tier enum (no longer needed)
DROP TYPE IF EXISTS public.vip_tier;
