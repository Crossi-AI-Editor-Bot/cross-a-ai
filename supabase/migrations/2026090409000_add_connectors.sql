-- Fix-up: an earlier version of this migration created user_connectors with
-- Google-specific columns (google_email, refresh_token-as-google-refresh,
-- gmail_read_enabled, etc). This migrates that table in place to the
-- GitHub-based shape, without dropping/recreating the table (safe to run
-- even if some of these columns don't exist yet).

-- Rename google_email -> account_login if present, otherwise just add it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_connectors' AND column_name='google_email')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_connectors' AND column_name='account_login') THEN
    ALTER TABLE public.user_connectors RENAME COLUMN google_email TO account_login;
  END IF;
END $$;

ALTER TABLE public.user_connectors
  ADD COLUMN IF NOT EXISTS account_login TEXT,
  ADD COLUMN IF NOT EXISTS installation_id TEXT,
  ADD COLUMN IF NOT EXISTS access_token TEXT,
  ADD COLUMN IF NOT EXISTS refresh_token TEXT,
  ADD COLUMN IF NOT EXISTS access_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS granted_scopes TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS github_read_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS github_write_enabled BOOLEAN NOT NULL DEFAULT false;

-- Drop the old Google-only columns now that GitHub equivalents exist.
ALTER TABLE public.user_connectors
  DROP COLUMN IF EXISTS gmail_read_enabled,
  DROP COLUMN IF EXISTS gmail_write_enabled,
  DROP COLUMN IF EXISTS drive_read_enabled;

-- Reset any leftover rows to point at the 'github' provider so old Google
-- rows don't linger under a provider the app no longer looks for. If you'd
-- rather force everyone to reconnect cleanly, you can instead run:
--   TRUNCATE public.user_connectors;
-- before this migration.
UPDATE public.user_connectors SET provider = 'github' WHERE provider = 'google';

ALTER TABLE public.user_connectors ALTER COLUMN provider SET DEFAULT 'github';

-- Make sure RLS + grants + index + model_costs flag are all in place
-- (idempotent, in case the very first migration attempt failed partway).
ALTER TABLE public.user_connectors ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.user_connectors TO service_role;

ALTER TABLE public.model_costs
  ADD COLUMN IF NOT EXISTS tool_connectors BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_user_connectors_user ON public.user_connectors(user_id);
