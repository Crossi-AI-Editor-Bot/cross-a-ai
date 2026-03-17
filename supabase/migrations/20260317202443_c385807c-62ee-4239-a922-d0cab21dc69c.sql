
-- Table to track blocked IPs
CREATE TABLE public.blocked_ips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL UNIQUE,
  reason text DEFAULT 'jailbreak_attempts',
  blocked_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.blocked_ips ENABLE ROW LEVEL SECURITY;

-- Only service role / edge functions can manage blocked IPs
CREATE POLICY "Admins can view blocked IPs" ON public.blocked_ips FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete blocked IPs" ON public.blocked_ips FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));
-- No public insert/update - only service role from edge functions

-- Table to track jailbreak attempts per IP
CREATE TABLE public.jailbreak_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL,
  user_id uuid,
  prompt_snippet text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.jailbreak_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view jailbreak attempts" ON public.jailbreak_attempts FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete jailbreak attempts" ON public.jailbreak_attempts FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));
