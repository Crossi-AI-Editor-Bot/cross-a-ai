-- Fix PUBLIC_DATA_EXPOSURE: Restrict model_costs to authenticated users only
-- Drop the overly permissive public read policy
DROP POLICY IF EXISTS "Anyone can view model costs" ON public.model_costs;

-- Create new policy that only allows authenticated users to view model costs
CREATE POLICY "Authenticated users can view model costs"
ON public.model_costs
FOR SELECT
USING (auth.uid() IS NOT NULL);