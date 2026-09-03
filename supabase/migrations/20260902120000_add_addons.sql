-- Addons feature: users can upload .caiaddon packages (renamed .zip files
-- containing addon.json + tools.json + tools/*.py) that register new
-- /!prefix:toolname commands the AI can call.

CREATE TABLE public.addons (
  id TEXT PRIMARY KEY,                        -- addon.json "id" (reverse-dns style)
  name TEXT NOT NULL,
  prefix TEXT NOT NULL UNIQUE,                 -- used as /!prefix:tool
  version TEXT,
  description TEXT,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name TEXT,
  addon_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  tools JSONB NOT NULL DEFAULT '[]'::jsonb,    -- [{name, file, description, parameters}]
  dependencies JSONB NOT NULL DEFAULT '[]'::jsonb,
  file_base64 TEXT NOT NULL,                   -- original .caiaddon bytes, for re-download
  file_size INTEGER NOT NULL DEFAULT 0,
  install_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.addon_tool_sources (
  addon_id TEXT NOT NULL REFERENCES public.addons(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  file TEXT NOT NULL,
  source TEXT NOT NULL,
  description TEXT,
  parameters JSONB NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (addon_id, tool_name)
);

CREATE TABLE public.user_addons (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addon_id TEXT NOT NULL REFERENCES public.addons(id) ON DELETE CASCADE,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, addon_id)
);

-- Addons are a public marketplace: anyone (incl. anonymous readers via anon key)
-- can browse what's available; writes only happen through the service-role
-- edge function (addons-manage), which validates and authenticates uploads.
GRANT SELECT ON public.addons TO anon, authenticated;
GRANT ALL ON public.addons TO service_role;
ALTER TABLE public.addons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view addons" ON public.addons FOR SELECT USING (true);

GRANT SELECT ON public.addon_tool_sources TO authenticated;
GRANT ALL ON public.addon_tool_sources TO service_role;
ALTER TABLE public.addon_tool_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view tool sources" ON public.addon_tool_sources FOR SELECT USING (auth.role() = 'authenticated');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_addons TO authenticated;
GRANT ALL ON public.user_addons TO service_role;
ALTER TABLE public.user_addons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own installed addons" ON public.user_addons FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Per-model toggle for the addon tool system, consistent with the other
-- /! tool flags on model_costs.
ALTER TABLE public.model_costs
  ADD COLUMN IF NOT EXISTS tool_addons BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_addons_author ON public.addons(author_id);
CREATE INDEX IF NOT EXISTS idx_user_addons_user ON public.user_addons(user_id);
