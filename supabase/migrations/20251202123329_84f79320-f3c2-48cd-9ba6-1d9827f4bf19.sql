-- Create advent calendar claims table
CREATE TABLE public.advent_claims (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  day_number INTEGER NOT NULL CHECK (day_number >= 1 AND day_number <= 24),
  credits_awarded NUMERIC NOT NULL,
  claimed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  year INTEGER NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  UNIQUE (user_id, day_number, year)
);

-- Enable RLS
ALTER TABLE public.advent_claims ENABLE ROW LEVEL SECURITY;

-- Users can view their own claims
CREATE POLICY "Users can view their own advent claims"
ON public.advent_claims
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own claims
CREATE POLICY "Users can insert their own advent claims"
ON public.advent_claims
FOR INSERT
WITH CHECK (auth.uid() = user_id);