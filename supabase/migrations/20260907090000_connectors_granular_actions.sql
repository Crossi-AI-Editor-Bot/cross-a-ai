-- Replaces the coarse github_read_enabled / github_write_enabled toggles
-- with a granular list of enabled GitHub actions, so each permission (e.g.
-- "commit", "issue_read", "create_issue", "profile", ...) can be turned on
-- or off individually, and the UI can offer "enable all repo" / "enable all
-- account" / "enable all" bulk actions.

ALTER TABLE public.user_connectors
  ADD COLUMN IF NOT EXISTS enabled_actions TEXT[] NOT NULL DEFAULT '{}';

-- Best-effort carry-over: anyone who previously had the blanket read/write
-- toggles on gets a sensible starter set so they don't lose all access.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_connectors' AND column_name='github_read_enabled') THEN
    UPDATE public.user_connectors
    SET enabled_actions = (
      SELECT array_agg(DISTINCT a) FROM unnest(
        enabled_actions
        || CASE WHEN github_read_enabled THEN ARRAY['repo_info','read_file','issue_read','pr_read','profile'] ELSE '{}'::text[] END
        || CASE WHEN github_write_enabled THEN ARRAY['commit','create_issue','comment_issue'] ELSE '{}'::text[] END
      ) AS a
    )
    WHERE github_read_enabled IS TRUE OR github_write_enabled IS TRUE;
  END IF;
END $$;

ALTER TABLE public.user_connectors
  DROP COLUMN IF EXISTS github_read_enabled,
  DROP COLUMN IF EXISTS github_write_enabled;
