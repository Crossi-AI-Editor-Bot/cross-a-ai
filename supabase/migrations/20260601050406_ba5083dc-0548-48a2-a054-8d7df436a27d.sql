
-- ============= magic_hour_keys =============
CREATE TABLE public.magic_hour_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  secret_name text NOT NULL UNIQUE,
  category text CHECK (category IN ('video','image','audio')),
  enabled boolean NOT NULL DEFAULT true,
  last_402_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.magic_hour_keys TO authenticated;
GRANT ALL ON public.magic_hour_keys TO service_role;

ALTER TABLE public.magic_hour_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage magic_hour_keys"
  ON public.magic_hour_keys FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.magic_hour_keys (secret_name, category) VALUES
  ('MH1','video'),('MH2','video'),('MH3','video'),
  ('MH4','image'),('MH5','image'),
  ('MH6','audio'),('MH7','audio'),
  ('MH8', NULL);

-- ============= generation_queue rebuild =============
DROP TABLE IF EXISTS public.generation_queue CASCADE;

CREATE TABLE public.generation_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  conversation_id uuid,
  model_cost_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('image','video','audio')),
  prompt text NOT NULL,
  image_input text,
  duration int,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','done','failed')),
  result_image text,
  result_video text,
  result_audio text,
  error text,
  position bigserial,
  last_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.generation_queue TO authenticated;
GRANT ALL ON public.generation_queue TO service_role;
-- bigserial sequence
GRANT USAGE, SELECT ON SEQUENCE public.generation_queue_position_seq TO authenticated;

ALTER TABLE public.generation_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own queue"
  ON public.generation_queue FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own queue"
  ON public.generation_queue FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.generation_queue;
ALTER TABLE public.generation_queue REPLICA IDENTITY FULL;

-- ============= vip_tiers new columns =============
ALTER TABLE public.vip_tiers
  ADD COLUMN IF NOT EXISTS weekly_audio_credits int NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS monthly_video_credits int NOT NULL DEFAULT 5;

-- ============= model_costs new column =============
ALTER TABLE public.model_costs
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'text' CHECK (kind IN ('text','image','video','audio'));

-- ============= Service role can update user_audio_credits / user_video_credits =============
DROP POLICY IF EXISTS "Service role updates audio credits" ON public.user_audio_credits;
CREATE POLICY "Service role updates audio credits"
  ON public.user_audio_credits FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role updates video credits" ON public.user_video_credits;
CREATE POLICY "Service role updates video credits"
  ON public.user_video_credits FOR UPDATE USING (true) WITH CHECK (true);

-- ============= Reset functions (corrected) =============
CREATE OR REPLACE FUNCTION public.reset_weekly_audio_credits(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_tier text;
  tier_amount int;
  reset_amount int;
  free_defaults jsonb;
BEGIN
  IF p_user_id != auth.uid() THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT tier INTO user_tier FROM public.vip_status
    WHERE user_id = p_user_id AND expires_at > now();

  IF user_tier IS NOT NULL THEN
    SELECT weekly_audio_credits INTO tier_amount FROM public.vip_tiers WHERE name = user_tier;
    reset_amount := COALESCE(tier_amount, 10);
  ELSE
    SELECT value INTO free_defaults FROM public.site_settings WHERE key = 'free_tier_defaults';
    reset_amount := COALESCE((free_defaults->>'weekly_audio')::int, 10);
  END IF;

  UPDATE public.user_audio_credits
    SET credits = reset_amount, last_reset_date = now()
    WHERE user_id = p_user_id AND last_reset_date < now() - INTERVAL '7 days';
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_monthly_video_credits(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_tier text;
  tier_amount int;
  reset_amount int;
  free_defaults jsonb;
BEGIN
  IF p_user_id != auth.uid() THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT tier INTO user_tier FROM public.vip_status
    WHERE user_id = p_user_id AND expires_at > now();

  IF user_tier IS NOT NULL THEN
    SELECT monthly_video_credits INTO tier_amount FROM public.vip_tiers WHERE name = user_tier;
    reset_amount := COALESCE(tier_amount, 5);
  ELSE
    SELECT value INTO free_defaults FROM public.site_settings WHERE key = 'free_tier_defaults';
    reset_amount := COALESCE((free_defaults->>'monthly_video')::int, 5);
  END IF;

  UPDATE public.user_video_credits
    SET credits = reset_amount, last_reset_date = now()
    WHERE user_id = p_user_id AND last_reset_date < now() - INTERVAL '30 days';
END;
$$;

-- Update existing image reset to also consult free_tier_defaults
CREATE OR REPLACE FUNCTION public.reset_weekly_image_credits(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  days_since_reset integer;
  user_tier text;
  tier_image_credits integer;
  reset_amount integer;
  free_defaults jsonb;
BEGIN
  IF p_user_id != auth.uid() THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT (CURRENT_DATE - last_reset_date)::integer INTO days_since_reset
  FROM public.user_image_credits WHERE user_id = p_user_id;

  IF days_since_reset >= 7 THEN
    SELECT tier INTO user_tier FROM public.vip_status
      WHERE user_id = p_user_id AND expires_at > now();
    IF user_tier IS NOT NULL THEN
      SELECT weekly_image_credits INTO tier_image_credits
        FROM public.vip_tiers WHERE name = user_tier;
      reset_amount := COALESCE(tier_image_credits, 30);
    ELSE
      SELECT value INTO free_defaults FROM public.site_settings WHERE key = 'free_tier_defaults';
      reset_amount := COALESCE((free_defaults->>'weekly_image')::int, 30);
    END IF;

    UPDATE public.user_image_credits
      SET credits = reset_amount, last_reset_date = CURRENT_DATE, updated_at = now()
      WHERE user_id = p_user_id;
  END IF;
END;
$$;

-- ============= Seed free_tier_defaults if missing =============
INSERT INTO public.site_settings (key, value) VALUES
  ('free_tier_defaults', jsonb_build_object('daily_credits',15,'weekly_image',30,'weekly_audio',10,'monthly_video',5))
ON CONFLICT (key) DO NOTHING;

-- ============= Drop magnific models =============
DELETE FROM public.model_costs
  WHERE model_id LIKE 'magnific-%';

-- ============= Seed Magic Hour models =============
INSERT INTO public.model_costs (model_id, label, cost, image_cost, audio_credits_per_second, video_credits_per_second, enabled, public_access, folder, kind) VALUES
  ('magic-hour-image/ai-image-generator', 'Magic Hour Image', 0, 1, 1, 1, true, true, 'Magic Hour', 'image'),
  ('magic-hour-video/text-to-video', 'Magic Hour Video (T2V)', 0, 0, 1, 1, true, true, 'Magic Hour', 'video'),
  ('magic-hour-video/image-to-video', 'Magic Hour Video Extend (I2V)', 0, 0, 1, 1, true, true, 'Magic Hour', 'video'),
  ('magic-hour-audio/ai-voice-generator', 'Magic Hour Voice (TTS)', 0, 0, 1, 1, true, true, 'Magic Hour', 'audio');

INSERT INTO public.admin_folders (path)
  SELECT 'Magic Hour' WHERE NOT EXISTS (SELECT 1 FROM public.admin_folders WHERE path = 'Magic Hour');
