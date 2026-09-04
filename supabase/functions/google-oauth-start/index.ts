// Builds the Google OAuth consent URL for the caller and returns it so the
// frontend can redirect the browser there. The `state` param is a signed,
// short-lived token identifying which user is connecting (no extra table
// needed) - verified again in google-oauth-callback.
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

    const clientId = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
    const stateSecret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!clientId) return json({ error: 'Google connector is not configured on the server (missing GOOGLE_CLIENT_ID).' }, 500);

    const body = await req.json().catch(() => ({}));
    const redirectUri = String(body.redirectUri || `${supabaseUrl}/functions/v1/google-oauth-callback`);
    const returnTo = String(body.returnTo || '/connectors');

    const expires = Date.now() + 10 * 60 * 1000; // 10 minutes to complete the flow
    const payload = `${userData.user.id}.${expires}.${returnTo}`;
    const sig = await sign(payload, stateSecret);
    const state = btoa(`${payload}.${sig}`);

    const scopes = [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/drive.readonly',
      'openid',
      'email',
    ];

    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('access_type', 'offline'); // needed for a refresh_token
    url.searchParams.set('prompt', 'consent');       // force refresh_token even on repeat connects
    url.searchParams.set('include_granted_scopes', 'true');
    url.searchParams.set('scope', scopes.join(' '));
    url.searchParams.set('state', state);

    return json({ url: url.toString() });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
});
