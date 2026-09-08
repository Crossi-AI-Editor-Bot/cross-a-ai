// Manages the /connectors page: reports connection status and which
// GitHub actions the caller has enabled, lets them toggle individual
// actions (/!github:commit, /!github:issue_read, etc) on or off, bulk
// enable/disable a whole scope ("repo", "account", or "all"), and fully
// disconnect (deletes the stored token). Never returns the raw token to the
// client. The actual GitHub App authorization happens in
// github-oauth-start / github-oauth-callback; tool execution lives in
// ../_shared/connectorTools.ts.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ACTIONS, REPO_ACTION_NAMES, ACCOUNT_ACTION_NAMES, ALL_ACTION_NAMES } from '../_shared/connectorTools.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const namesForScope = (scope: string): string[] =>
  scope === 'repo' ? REPO_ACTION_NAMES : scope === 'account' ? ACCOUNT_ACTION_NAMES : ALL_ACTION_NAMES;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: authHeader ? { Authorization: authHeader } : {} },
    });
    const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    const { data: userData, error: userErr } = await anonClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: 'Not authenticated.' }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');

    const selectRow = () =>
      admin
        .from('user_connectors')
        .select('account_login, access_token, enabled_actions')
        .eq('user_id', userId)
        .eq('provider', 'github')
        .maybeSingle();

    if (action === 'status') {
      const { data } = await selectRow();
      return json({
        connected: !!data?.access_token,
        accountLogin: data?.account_login ?? null,
        enabledActions: data?.enabled_actions ?? [],
        // Static catalogue so the UI can render every togglable permission
        // without hard-coding the list — grouped the same way the site owner
        // sees them on GitHub's Permissions & events page.
        catalog: {
          repo: REPO_ACTION_NAMES.map((name) => ({ name, label: ACTIONS[name].label, usage: ACTIONS[name].usage })),
          account: ACCOUNT_ACTION_NAMES.map((name) => ({ name, label: ACTIONS[name].label, usage: ACTIONS[name].usage })),
        },
      });
    }

    if (action === 'toggle') {
      const tool = String(body.tool || '');
      const enabled = !!body.enabled;
      if (!ACTIONS[tool]) return json({ error: 'Unknown action.' }, 400);

      const { data: existing } = await selectRow();
      if (!existing?.access_token) return json({ error: 'Connect your GitHub account first.' }, 400);

      const current: string[] = existing.enabled_actions ?? [];
      const next = enabled ? Array.from(new Set([...current, tool])) : current.filter((a) => a !== tool);

      const { error } = await admin
        .from('user_connectors')
        .update({ enabled_actions: next, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('provider', 'github');
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, enabledActions: next });
    }

    if (action === 'toggle_all') {
      const scope = String(body.scope || 'all'); // "repo" | "account" | "all"
      const enabled = !!body.enabled;
      const names = namesForScope(scope);

      const { data: existing } = await selectRow();
      if (!existing?.access_token) return json({ error: 'Connect your GitHub account first.' }, 400);

      const current: string[] = existing.enabled_actions ?? [];
      const next = enabled
        ? Array.from(new Set([...current, ...names]))
        : current.filter((a) => !names.includes(a));

      const { error } = await admin
        .from('user_connectors')
        .update({ enabled_actions: next, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('provider', 'github');
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, enabledActions: next });
    }

    if (action === 'disconnect') {
      const { error } = await admin
        .from('user_connectors')
        .delete()
        .eq('user_id', userId)
        .eq('provider', 'github');
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    return json({ error: 'Unknown action.' }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
});
