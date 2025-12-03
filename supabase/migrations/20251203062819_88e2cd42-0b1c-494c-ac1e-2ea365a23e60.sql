CREATE OR REPLACE FUNCTION public.reset_daily_credits(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
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
  
  -- Reset to base credits only (no advent bonus accumulation)
  UPDATE public.user_credits
  SET credits = base_credits, last_reset_date = CURRENT_DATE
  WHERE user_id = p_user_id AND last_reset_date < CURRENT_DATE;
END;
$function$;