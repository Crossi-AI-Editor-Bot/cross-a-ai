-- Add image_cost column to model_costs for image-specific pricing
ALTER TABLE public.model_costs ADD COLUMN IF NOT EXISTS image_cost numeric DEFAULT 0;

-- Create user_image_credits table for weekly image credits
CREATE TABLE public.user_image_credits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  credits numeric NOT NULL DEFAULT 30,
  last_reset_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_image_credits ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_image_credits
CREATE POLICY "Users can view their own image credits" 
ON public.user_image_credits 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own image credits" 
ON public.user_image_credits 
FOR INSERT 
WITH CHECK ((auth.uid() = user_id) AND (credits <= 30));

-- Create function to reset weekly image credits
CREATE OR REPLACE FUNCTION public.reset_weekly_image_credits(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  days_since_reset integer;
BEGIN
  -- Validate caller can only reset their own credits
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized: Cannot reset credits for other users';
  END IF;
  
  -- Check days since last reset
  SELECT EXTRACT(DAY FROM (CURRENT_DATE - last_reset_date))::integer INTO days_since_reset
  FROM public.user_image_credits
  WHERE user_id = p_user_id;
  
  -- Reset to 30 credits if 7+ days have passed
  IF days_since_reset >= 7 THEN
    UPDATE public.user_image_credits
    SET credits = 30, last_reset_date = CURRENT_DATE, updated_at = now()
    WHERE user_id = p_user_id;
  END IF;
END;
$$;

-- Update handle_new_user to also create image credits
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
  
  -- Insert initial credits (15)
  INSERT INTO public.user_credits (user_id, credits, last_reset_date)
  VALUES (NEW.id, 15, CURRENT_DATE);
  
  -- Insert initial image credits (30)
  INSERT INTO public.user_image_credits (user_id, credits, last_reset_date)
  VALUES (NEW.id, 30, CURRENT_DATE);
  
  RETURN NEW;
END;
$$;