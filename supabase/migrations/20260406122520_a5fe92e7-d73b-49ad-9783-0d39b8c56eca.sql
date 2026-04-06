
CREATE OR REPLACE FUNCTION public.reset_weekly_image_credits(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  days_since_reset integer;
  user_tier text;
  tier_image_credits integer;
  reset_amount integer;
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: Cannot reset credits for other users';
  END IF;

  SELECT (CURRENT_DATE - last_reset_date)::integer INTO days_since_reset
  FROM public.user_image_credits
  WHERE user_id = p_user_id;

  IF days_since_reset >= 7 THEN
    SELECT tier INTO user_tier
    FROM public.vip_status
    WHERE user_id = p_user_id AND expires_at > now();

    IF user_tier IS NOT NULL THEN
      SELECT weekly_image_credits INTO tier_image_credits
      FROM public.vip_tiers WHERE name = user_tier;
      reset_amount := COALESCE(tier_image_credits, 30);
    ELSE
      reset_amount := 30;
    END IF;

    UPDATE public.user_image_credits
    SET credits = reset_amount, last_reset_date = CURRENT_DATE, updated_at = now()
    WHERE user_id = p_user_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reset_weekly_call_credits(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  days_since_reset integer;
  user_tier text;
  tier_call_credits integer;
  reset_amount integer;
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: Cannot reset credits for other users';
  END IF;

  SELECT (CURRENT_DATE - last_reset_date)::integer INTO days_since_reset
  FROM public.user_call_credits
  WHERE user_id = p_user_id;

  IF days_since_reset >= 7 THEN
    SELECT tier INTO user_tier
    FROM public.vip_status
    WHERE user_id = p_user_id AND expires_at > now();

    IF user_tier IS NOT NULL THEN
      SELECT weekly_call_credits INTO tier_call_credits
      FROM public.vip_tiers WHERE name = user_tier;
      reset_amount := COALESCE(tier_call_credits, 100);
    ELSE
      reset_amount := 100;
    END IF;

    UPDATE public.user_call_credits
    SET credits = reset_amount, last_reset_date = CURRENT_DATE, updated_at = now()
    WHERE user_id = p_user_id;
  END IF;
END;
$function$;
