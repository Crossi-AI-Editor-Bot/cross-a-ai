-- Update default credits from 20 to 15
ALTER TABLE public.user_credits 
ALTER COLUMN credits SET DEFAULT 15;

-- Update reset_daily_credits function to reset to 15
CREATE OR REPLACE FUNCTION public.reset_daily_credits(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- CRITICAL: Validate caller can only reset their own credits
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: Cannot reset credits for other users';
  END IF;
  
  UPDATE public.user_credits
  SET credits = 15, last_reset_date = CURRENT_DATE
  WHERE user_id = p_user_id AND last_reset_date < CURRENT_DATE;
END;
$$;

-- Update handle_new_user trigger function to give 15 initial credits
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Insert profile
  INSERT INTO public.profiles (user_id, email)
  VALUES (NEW.id, NEW.email);
  
  -- Insert initial credits (15 instead of 20)
  INSERT INTO public.user_credits (user_id, credits, last_reset_date)
  VALUES (NEW.id, 15, CURRENT_DATE);
  
  RETURN NEW;
END;
$$;