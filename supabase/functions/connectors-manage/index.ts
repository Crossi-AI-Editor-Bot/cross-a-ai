// Manages the /connectors page: reports connection + enabled-tool status
// for the caller's Google account, lets them flip gmail:read / gmail:write
// / drive:read on and off, and lets them fully disconnect (revokes the
// token with Google and deletes the row). Never returns raw tokens to the
// client. The actual OAuth handshake happens in google-oauth-start /
// google-oauth-callback; tool execution lives in ../_shared/connectorTools.ts.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

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
        .select('google_email, refresh_token, gmail_read_enabled, gmail_write_enabled, drive_read_enabled')
        .eq('user_id', userId)
        .eq('provider', 'google')
        .maybeSingle();

    if (action === 'status') {
      const { data } = await selectRow();
      return json({
        connected: !!data?.refresh_token,
        googleEmail: data?.google_email ?? null,
        gmailReadEnabled: !!data?.gmail_read_enabled,
        gmailWriteEnabled: !!data?.gmail_write_enabled,
        driveReadEnabled: !!data?.drive_read_enabled,
      });
    }

    if (action === 'toggle') {
      const tool = String(body.tool || '');
      const enabled = !!body.enabled;
      const columnByTool: Record<string, string> = {
        'gmail:read': 'gmail_read_enabled',
        'gmail:write': 'gmail_write_enabled',
        'drive:read': 'drive_read_enabled',
      };
      const column = columnByTool[tool];
      if (!column) return json({ error: 'Unknown tool.' }, 400);

      const { data: existing } = await selectRow();
      if (!existing?.refresh_token) return json({ error: 'Connect your Google account first.' }, 400);

      const { error } = await admin
        .from('user_connectors')
        .update({ [column]: enabled, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('provider', 'google');
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    if (action === 'disconnect') {
      const { data: existing } = await selectRow();
      const token = (existing as any)?.refresh_token as string | undefined;
      if (token) {
        try {
          await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST' });
        } catch {
          // best-effort revoke; still delete our copy below
        }
      }
      const { error } = await admin
        .from('user_connectors')
        .delete()
        .eq('user_id', userId)
        .eq('provider', 'google');
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    return json({ error: 'Unknown action.' }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
});
