-- Connectors feature: users install/authorize a GitHub App to link their
-- GitHub account. Once linked, the AI can call /!github:read and
-- /!github:write tools that act on the user's own GitHub account using a
-- securely stored access token. Tokens are only ever written/read by
-- service-role edge functions (connectors-manage, github-oauth-callback);
-- the table itself is not directly readable by the client.

CREATE TABLE public.user_connectors (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'github',
  account_login TEXT,                          -- GitHub username
  installation_id TEXT,                        -- GitHub App installation id
  access_token TEXT,                           -- user-to-server token
  refresh_token TEXT,                          -- present only if "expire user tokens" is on
  access_token_expires_at TIMESTAMPTZ,
  granted_scopes TEXT[] NOT NULL DEFAULT '{}',
  github_read_enabled BOOLEAN NOT NULL DEFAULT false,
  github_write_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, provider)
);

-- No direct client access at all: everything goes through the
-- connectors-manage edge function (service role), which never returns the
-- raw tokens to the browser — only connection/enabled status.
ALTER TABLE public.user_connectors ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.user_connectors TO service_role;

-- Per-model toggle for the connector tool system, consistent with the
-- other /! tool flags on model_costs.
ALTER TABLE public.model_costs
  ADD COLUMN IF NOT EXISTS tool_connectors BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_user_connectors_user ON public.user_connectors(user_id);
