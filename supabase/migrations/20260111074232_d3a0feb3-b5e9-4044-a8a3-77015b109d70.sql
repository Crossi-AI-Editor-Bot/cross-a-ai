-- Allow admins to insert VIP status when approving requests
CREATE POLICY "Admins can insert VIP status"
ON public.vip_status
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to update VIP status
CREATE POLICY "Admins can update VIP status"
ON public.vip_status
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));