
-- Update reset_daily_credits to preserve advent bonus credits
CREATE OR REPLACE FUNCTION public.reset_daily_credits(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  advent_bonus numeric;
BEGIN
  -- CRITICAL: Validate caller can only reset their own credits
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: Cannot reset credits for other users';
  END IF;
  
  -- Calculate total advent credits earned this year
  SELECT COALESCE(SUM(credits_awarded), 0) INTO advent_bonus
  FROM public.advent_claims
  WHERE user_id = p_user_id AND year = EXTRACT(year FROM CURRENT_DATE);
  
  -- Reset to 15 base credits + advent bonus credits
  UPDATE public.user_credits
  SET credits = 15 + advent_bonus, last_reset_date = CURRENT_DATE
  WHERE user_id = p_user_id AND last_reset_date < CURRENT_DATE;
END;
$function$;
