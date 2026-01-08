-- Allow service role to update user image credits (for edge function deduction)
CREATE POLICY "Service role can update image credits"
ON public.user_image_credits
FOR UPDATE
USING (true)
WITH CHECK (true);

-- Also create a policy for service role on user_credits if missing
CREATE POLICY "Service role can update credits"
ON public.user_credits
FOR UPDATE
USING (true)
WITH CHECK (true);