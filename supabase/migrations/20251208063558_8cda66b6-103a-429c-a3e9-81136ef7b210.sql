-- Remove INSERT policy that allows users to grant themselves VIP status
DROP POLICY IF EXISTS "Users can insert their own VIP status" ON public.vip_status;

-- Remove UPDATE policy that allows users to modify their VIP expiration
DROP POLICY IF EXISTS "Users can update their own VIP status" ON public.vip_status;