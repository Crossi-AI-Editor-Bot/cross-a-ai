-- Connectors feature: users can sign in with Google (via OAuth, offline
-- access) to link Gmail and/or Google Drive to their account. Once enabled,
-- the AI can call /!gmail:read, /!gmail:write and /!drive:read tools that
-- act on the user's own Google account using a securely stored refresh
-- token. Tokens are only ever written/read by service-role edge functions
-- (connectors-manage, google-oauth-callback); the table itself is not
-- directly readable by the client.

CREATE TABLE public.user_connectors (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'google',
  google_email TEXT,
  refresh_token TEXT,                          -- long-lived, used to mint access tokens
  access_token TEXT,                           -- short-lived cache
  access_token_expires_at TIMESTAMPTZ,
  granted_scopes TEXT[] NOT NULL DEFAULT '{}',
  gmail_read_enabled BOOLEAN NOT NULL DEFAULT false,
  gmail_write_enabled BOOLEAN NOT NULL DEFAULT false,
  drive_read_enabled BOOLEAN NOT NULL DEFAULT false,
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
