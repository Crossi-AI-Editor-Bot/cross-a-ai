CREATE TABLE public.custom_vip_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  icon_name TEXT NOT NULL DEFAULT 'Crown',
  gradient_from TEXT NOT NULL DEFAULT 'from-gray-400',
  gradient_to TEXT NOT NULL DEFAULT 'to-gray-300',
  text_color TEXT NOT NULL DEFAULT 'text-gray-500',
  bg_color TEXT NOT NULL DEFAULT 'bg-gray-100',
  color_label TEXT NOT NULL DEFAULT 'Slate',
  daily_credits INTEGER NOT NULL DEFAULT 15,
  weekly_image_credits INTEGER NOT NULL DEFAULT 30,
  model_access_tier TEXT NOT NULL DEFAULT 'bronze',
  display_name TEXT NOT NULL DEFAULT 'Custom VIP',
  ai_price INTEGER,
  ai_reasoning TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.custom_vip_configs ENABLE ROW LEVEL SECURITY;

-- Users can view their own configs
CREATE POLICY "Users can view own custom vip configs"
ON public.custom_vip_configs FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can create their own configs
CREATE POLICY "Users can create own custom vip configs"
ON public.custom_vip_configs FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own pending configs
CREATE POLICY "Users can delete own custom vip configs"
ON public.custom_vip_configs FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Service role can update (for AI pricing)
CREATE POLICY "Service role can update custom vip configs"
ON public.custom_vip_configs FOR UPDATE
USING (true)
WITH CHECK (true);

-- Admins can view all
CREATE POLICY "Admins can view all custom vip configs"
ON public.custom_vip_configs FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));