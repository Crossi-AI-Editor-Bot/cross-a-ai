ALTER TABLE public.custom_vip_configs
  ADD COLUMN IF NOT EXISTS weekly_audio_credits integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS monthly_video_credits integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS weekly_call_credits integer NOT NULL DEFAULT 100;

CREATE OR REPLACE FUNCTION public.reset_weekly_call_credits(p_user_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  days_since_reset integer;
  user_tier text;
  tier_call_credits integer;
  reset_amount integer;
  free_defaults jsonb;
  custom_amount integer;
BEGIN
  IF p_user_id != auth.uid() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT (CURRENT_DATE - last_reset_date)::integer INTO days_since_reset
  FROM public.user_call_credits WHERE user_id = p_user_id;
  IF days_since_reset >= 7 THEN
    SELECT weekly_call_credits INTO custom_amount FROM public.custom_vip_configs
      WHERE user_id = p_user_id AND status = 'active' AND expires_at > now()
      ORDER BY created_at DESC LIMIT 1;
    IF custom_amount IS NOT NULL THEN
      reset_amount := custom_amount;
    ELSE
      SELECT tier INTO user_tier FROM public.vip_status WHERE user_id = p_user_id AND expires_at > now();
      IF user_tier IS NOT NULL THEN
        SELECT weekly_call_credits INTO tier_call_credits FROM public.vip_tiers WHERE name = user_tier;
        reset_amount := COALESCE(tier_call_credits, 100);
      ELSE
        SELECT value INTO free_defaults FROM public.site_settings WHERE key = 'free_tier_defaults';
        reset_amount := COALESCE((free_defaults->>'weekly_call')::int, 100);
      END IF;
    END IF;
    UPDATE public.user_call_credits
    SET credits = reset_amount, last_reset_date = CURRENT_DATE, updated_at = now()
    WHERE user_id = p_user_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reset_weekly_audio_credits(p_user_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  user_tier text; tier_amount int; reset_amount int; free_defaults jsonb; custom_amount int;
BEGIN
  IF p_user_id != auth.uid() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT weekly_audio_credits INTO custom_amount FROM public.custom_vip_configs
    WHERE user_id = p_user_id AND status = 'active' AND expires_at > now()
    ORDER BY created_at DESC LIMIT 1;
  IF custom_amount IS NOT NULL THEN
    reset_amount := custom_amount;
  ELSE
    SELECT tier INTO user_tier FROM public.vip_status WHERE user_id = p_user_id AND expires_at > now();
    IF user_tier IS NOT NULL THEN
      SELECT weekly_audio_credits INTO tier_amount FROM public.vip_tiers WHERE name = user_tier;
      reset_amount := COALESCE(tier_amount, 10);
    ELSE
      SELECT value INTO free_defaults FROM public.site_settings WHERE key = 'free_tier_defaults';
      reset_amount := COALESCE((free_defaults->>'weekly_audio')::int, 10);
    END IF;
  END IF;
  UPDATE public.user_audio_credits SET credits = reset_amount, last_reset_date = now()
    WHERE user_id = p_user_id AND last_reset_date < now() - INTERVAL '7 days';
END;
$function$;

CREATE OR REPLACE FUNCTION public.reset_monthly_video_credits(p_user_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  user_tier text; tier_amount int; reset_amount int; free_defaults jsonb; custom_amount int;
BEGIN
  IF p_user_id != auth.uid() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  SELECT monthly_video_credits INTO custom_amount FROM public.custom_vip_configs
    WHERE user_id = p_user_id AND status = 'active' AND expires_at > now()
    ORDER BY created_at DESC LIMIT 1;
  IF custom_amount IS NOT NULL THEN
    reset_amount := custom_amount;
  ELSE
    SELECT tier INTO user_tier FROM public.vip_status WHERE user_id = p_user_id AND expires_at > now();
    IF user_tier IS NOT NULL THEN
      SELECT monthly_video_credits INTO tier_amount FROM public.vip_tiers WHERE name = user_tier;
      reset_amount := COALESCE(tier_amount, 5);
    ELSE
      SELECT value INTO free_defaults FROM public.site_settings WHERE key = 'free_tier_defaults';
      reset_amount := COALESCE((free_defaults->>'monthly_video')::int, 5);
    END IF;
  END IF;
  UPDATE public.user_video_credits SET credits = reset_amount, last_reset_date = now()
    WHERE user_id = p_user_id AND last_reset_date < now() - INTERVAL '30 days';
END;
$function$;