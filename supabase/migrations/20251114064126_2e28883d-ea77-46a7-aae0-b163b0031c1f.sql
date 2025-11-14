-- Fix SECURITY DEFINER function to prevent privilege escalation
-- Add validation that users can only reset their own credits
CREATE OR REPLACE FUNCTION public.reset_daily_credits(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- CRITICAL: Validate caller can only reset their own credits
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: Cannot reset credits for other users';
  END IF;
  
  UPDATE public.user_credits
  SET credits = 20, last_reset_date = CURRENT_DATE
  WHERE user_id = p_user_id AND last_reset_date < CURRENT_DATE;
END;
$$;