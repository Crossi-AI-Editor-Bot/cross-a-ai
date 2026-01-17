-- Add delete policy for admins on vip_status
CREATE POLICY "Admins can delete VIP status" 
ON public.vip_status 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));