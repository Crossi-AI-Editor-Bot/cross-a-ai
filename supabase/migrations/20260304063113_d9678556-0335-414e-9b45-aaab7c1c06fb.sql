
-- 1. Create user_call_credits table (mirrors user_image_credits)
CREATE TABLE public.user_call_credits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  credits NUMERIC NOT NULL DEFAULT 100,
  last_reset_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.user_call_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own call credits"
  ON public.user_call_credits FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own call credits"
  ON public.user_call_credits FOR INSERT
  WITH CHECK (auth.uid() = user_id AND credits <= 100);

CREATE POLICY "Service role can update call credits"
  ON public.user_call_credits FOR UPDATE
  USING (true) WITH CHECK (true);

-- 2. Add weekly image/call credits columns to vip_tiers
ALTER TABLE public.vip_tiers
  ADD COLUMN weekly_image_credits INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN weekly_call_credits INTEGER NOT NULL DEFAULT 100;

-- 3. Create reset function for call credits
CREATE OR REPLACE FUNCTION public.reset_weekly_call_credits(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  days_since_reset integer;
  user_tier text;
  tier_call_credits integer;
  reset_amount integer;
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: Cannot reset credits for other users';
  END IF;

  SELECT EXTRACT(DAY FROM (CURRENT_DATE - last_reset_date))::integer INTO days_since_reset
  FROM public.user_call_credits
  WHERE user_id = p_user_id;

  IF days_since_reset >= 7 THEN
    -- Get user tier
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
$$;

-- 4. Update reset_weekly_image_credits to be tier-aware
CREATE OR REPLACE FUNCTION public.reset_weekly_image_credits(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  days_since_reset integer;
  user_tier text;
  tier_image_credits integer;
  reset_amount integer;
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: Cannot reset credits for other users';
  END IF;

  SELECT EXTRACT(DAY FROM (CURRENT_DATE - last_reset_date))::integer INTO days_since_reset
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
$$;

-- 5. Update handle_new_user to also create call credits
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email)
  VALUES (NEW.id, NEW.email);

  INSERT INTO public.user_credits (user_id, credits, last_reset_date)
  VALUES (NEW.id, 15, CURRENT_DATE);

  INSERT INTO public.user_image_credits (user_id, credits, last_reset_date)
  VALUES (NEW.id, 30, CURRENT_DATE);

  INSERT INTO public.user_call_credits (user_id, credits, last_reset_date)
  VALUES (NEW.id, 100, CURRENT_DATE);

  RETURN NEW;
END;
$$;
