-- Update the reset_daily_credits function to support VIP tiers
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
BEGIN
  -- CRITICAL: Validate caller can only reset their own credits
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: Cannot reset credits for other users';
  END IF;
  
  -- Check if user is admin
  SELECT public.has_role(p_user_id, 'admin') INTO is_admin;
  
  -- Check user's VIP tier
  SELECT tier::text INTO user_tier
  FROM public.vip_status 
  WHERE user_id = p_user_id AND expires_at > now();
  
  -- Set credits based on tier (admins get diamond level)
  IF is_admin THEN
    base_credits := 25; -- Diamond level for admins
  ELSIF user_tier = 'diamond' THEN
    base_credits := 25;
  ELSIF user_tier = 'gold' THEN
    base_credits := 22;
  ELSIF user_tier = 'silver' THEN
    base_credits := 20;
  ELSIF user_tier = 'bronze' THEN
    base_credits := 18;
  ELSE
    base_credits := 15; -- Free users
  END IF;
  
  -- Reset to base credits only (no advent bonus accumulation)
  UPDATE public.user_credits
  SET credits = base_credits, last_reset_date = CURRENT_DATE
  WHERE user_id = p_user_id AND last_reset_date < CURRENT_DATE;
END;
$function$;