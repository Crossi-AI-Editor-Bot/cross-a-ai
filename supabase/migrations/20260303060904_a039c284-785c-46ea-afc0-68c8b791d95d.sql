
-- Add hidden column to vip_tiers for invisible tiers
ALTER TABLE public.vip_tiers ADD COLUMN hidden boolean NOT NULL DEFAULT false;

-- Create invite codes table
CREATE TABLE public.vip_invite_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  tier_name text NOT NULL,
  created_by uuid NOT NULL,
  used_by uuid,
  used_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  active boolean NOT NULL DEFAULT true
);

ALTER TABLE public.vip_invite_codes ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can view all invite codes"
ON public.vip_invite_codes FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert invite codes"
ON public.vip_invite_codes FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update invite codes"
ON public.vip_invite_codes FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete invite codes"
ON public.vip_invite_codes FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));
