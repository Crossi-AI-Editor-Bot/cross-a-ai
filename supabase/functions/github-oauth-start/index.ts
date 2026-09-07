// Builds the GitHub App authorization URL for the caller and returns it so
// the frontend can redirect the browser there. The `state` param is a
// signed, short-lived token identifying which user is connecting (no extra
// table needed) - verified again in github-oauth-callback.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return toHex(sig);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: authHeader ? { Authorization: authHeader } : {} },
    });
    const { data: userData, error: userErr } = await anonClient.auth.getUser();
    if (userErr || !userData?.user) return json({ error: 'Not authenticated.' }, 401);

    const clientId = Deno.env.get('GITHUB_APP_CLIENT_ID') ?? '';
    const stateSecret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!clientId) return json({ error: 'GitHub connector is not configured on the server (missing GITHUB_APP_CLIENT_ID).' }, 500);

    const body = await req.json().catch(() => ({}));
    const returnTo = String(body.returnTo || '/connectors');

    const expires = Date.now() + 10 * 60 * 1000; // 10 minutes to complete the flow
    const payload = `${userData.user.id}.${expires}.${returnTo}`;
    const sig = await sign(payload, stateSecret);
    const state = btoa(`${payload}.${sig}`);

    // For a GitHub App, the authorize URL both asks the user to install the
    // app (choosing which repos to grant it) and to authorize it to act as
    // them - GitHub handles both in one screen.
    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('state', state);

    return json({ url: url.toString() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
});
