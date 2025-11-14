-- Add INSERT policies for profiles and user_credits tables

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can insert their own credits"
  ON public.user_credits FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND credits <= 20);