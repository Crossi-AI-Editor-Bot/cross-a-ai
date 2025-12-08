-- Remove UPDATE policy that allows users to manipulate their own credits
-- Credit changes should ONLY happen through secure edge functions (chat, claim-advent)
DROP POLICY IF EXISTS "Users can update their own credits" ON public.user_credits;