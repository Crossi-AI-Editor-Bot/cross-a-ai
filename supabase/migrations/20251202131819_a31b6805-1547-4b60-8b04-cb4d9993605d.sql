-- Create VIP status table
CREATE TABLE public.vip_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  expires_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.vip_status ENABLE ROW LEVEL SECURITY;

-- Users can view their own VIP status
CREATE POLICY "Users can view their own VIP status"
ON public.vip_status
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own VIP status
CREATE POLICY "Users can insert their own VIP status"
ON public.vip_status
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own VIP status
CREATE POLICY "Users can update their own VIP status"
ON public.vip_status
FOR UPDATE
USING (auth.uid() = user_id);

-- Update reset_daily_credits to give VIP users 20 credits
CREATE OR REPLACE FUNCTION public.reset_daily_credits(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  advent_bonus numeric;
  is_vip boolean;
  base_credits numeric;
BEGIN
  -- CRITICAL: Validate caller can only reset their own credits
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: Cannot reset credits for other users';
  END IF;
  
  -- Check if user has active VIP status
  SELECT EXISTS (
    SELECT 1 FROM public.vip_status 
    WHERE user_id = p_user_id AND expires_at > now()
  ) INTO is_vip;
  
  -- Set base credits based on VIP status
  IF is_vip THEN
    base_credits := 25;
  ELSE
    base_credits := 15;
  END IF;
  
  -- Calculate total advent credits earned this year
  SELECT COALESCE(SUM(credits_awarded), 0) INTO advent_bonus
  FROM public.advent_claims
  WHERE user_id = p_user_id AND year = EXTRACT(year FROM CURRENT_DATE);
  
  -- Reset to base credits + advent bonus credits
  UPDATE public.user_credits
  SET credits = base_credits + advent_bonus, last_reset_date = CURRENT_DATE
  WHERE user_id = p_user_id AND last_reset_date < CURRENT_DATE;
END;
$function$;