
CREATE TABLE public.user_mods (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  installed TEXT[] NOT NULL DEFAULT '{}',
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_mods TO authenticated;
GRANT ALL ON public.user_mods TO service_role;
ALTER TABLE public.user_mods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own mods" ON public.user_mods FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
