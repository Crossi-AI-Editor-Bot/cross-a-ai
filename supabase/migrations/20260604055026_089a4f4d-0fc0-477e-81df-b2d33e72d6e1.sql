UPDATE public.model_costs SET label = 'Crossi 5.1 Image Gen (Z Image Turbo)' WHERE model_id = 'magic-hour-image/ai-image-generator';
UPDATE public.model_costs SET label = 'Crossi 5.1 Video Gen (LTX-2)' WHERE model_id = 'magic-hour-video/text-to-video';
UPDATE public.model_costs SET label = 'Crossi 5.1 Video Extend (LTX-2)' WHERE model_id = 'magic-hour-video/image-to-video';

INSERT INTO public.model_costs (model_id, label, kind, cost, image_cost, audio_credits_per_second, video_credits_per_second, enabled, public_access)
SELECT 'magic-hour-audio/ai-voice-generator', 'Crossi 5.1 Voice (TTS)', 'text', 0, 0, 1.0, 1.0, true, true
WHERE NOT EXISTS (SELECT 1 FROM public.model_costs WHERE model_id = 'magic-hour-audio/ai-voice-generator');

INSERT INTO public.magic_hour_keys (secret_name, category, enabled)
SELECT s, 'audio', true FROM unnest(ARRAY['MH1','MH2','MH3','MH4','MH5','MH6','MH7','MH8']) AS s
WHERE NOT EXISTS (SELECT 1 FROM public.magic_hour_keys WHERE category = 'audio');