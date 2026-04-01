CREATE POLICY "Users can delete their own VIP status"
ON public.vip_status
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);