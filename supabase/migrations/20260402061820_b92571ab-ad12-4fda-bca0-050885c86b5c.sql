
CREATE OR REPLACE FUNCTION public.reset_daily_credits(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  user_tier text;
  tier_credits integer;
  base_credits numeric;
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: Cannot reset credits for other users';
  END IF;
  
  SELECT tier INTO user_tier
  FROM public.vip_status 
  WHERE user_id = p_user_id AND expires_at > now();
  
  IF user_tier IS NOT NULL THEN
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
