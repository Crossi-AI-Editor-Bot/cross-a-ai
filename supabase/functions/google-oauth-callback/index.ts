// The redirect_uri Google sends the browser back to after consent. Verifies
// the signed `state`, exchanges the `code` for tokens, upserts them into
// public.user_connectors for that user, and redirects back to /connectors
// on the site with a status flag the frontend can toast.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return toHex(sig);
}

function siteOrigin(req: Request): string {
  return Deno.env.get('SITE_URL') || new URL(req.url).origin.replace('.supabase.co', '.lovable.app');
}

Deno.serve(async (req) => {
  const reqUrl = new URL(req.url);
  const code = reqUrl.searchParams.get('code');
  const state = reqUrl.searchParams.get('state');
  const oauthError = reqUrl.searchParams.get('error');
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const stateSecret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const admin = createClient(supabaseUrl, stateSecret);

  const redirectTo = (path: string, ok: boolean, message?: string) => {
    const origin = siteOrigin(req);
    const u = new URL(path, origin);
    u.searchParams.set('connector', ok ? 'connected' : 'error');
    if (message) u.searchParams.set('message', message);
    return new Response(null, { status: 302, headers: { Location: u.toString() } });
  };

  try {
    if (oauthError) return redirectTo('/connectors', false, oauthError);
    if (!code || !state) return redirectTo('/connectors', false, 'Missing code or state.');

    let decoded: string;
    try {
      decoded = atob(state);
    } catch {
      return redirectTo('/connectors', false, 'Invalid state.');
    }
    const parts = decoded.split('.');
    const sig = parts.pop()!;
    const returnTo = parts.pop()!;
    const expires = Number(parts.pop());
    const userId = parts.join('.');
    const expectedSig = await sign(`${userId}.${expires}.${returnTo}`, stateSecret);
    if (sig !== expectedSig) return redirectTo('/connectors', false, 'State signature mismatch.');
    if (!Number.isFinite(expires) || Date.now() > expires) return redirectTo('/connectors', false, 'Login link expired, try again.');

    const clientId = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';
    const redirectUri = `${supabaseUrl}/functions/v1/google-oauth-callback`;

    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tokenJson = await tokenResp.json();
    if (!tokenResp.ok) return redirectTo(returnTo || '/connectors', false, tokenJson.error_description || tokenJson.error || 'Token exchange failed.');

    const accessToken = tokenJson.access_token as string;
    const refreshToken = tokenJson.refresh_token as string | undefined;
    const expiresIn = Number(tokenJson.expires_in ?? 3600);
    const scope = String(tokenJson.scope ?? '');

    // Google only returns a refresh_token the FIRST time a user consents
    // (or when prompt=consent forces re-consent, which google-oauth-start
    // always sets) - if for some reason it's missing and we don't already
    // have one stored, the user needs to try again.
    let email: string | null = null;
    try {
      const uiResp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } });
      if (uiResp.ok) email = (await uiResp.json()).email ?? null;
    } catch {
      // non-fatal
    }

    const { data: existing } = await admin
      .from('user_connectors')
      .select('refresh_token')
      .eq('user_id', userId)
      .eq('provider', 'google')
      .maybeSingle();

    const finalRefreshToken = refreshToken || (existing as any)?.refresh_token || null;
    if (!finalRefreshToken) return redirectTo(returnTo || '/connectors', false, 'Google did not grant offline access — please try connecting again.');

    const { error: upsertErr } = await admin.from('user_connectors').upsert({
      user_id: userId,
      provider: 'google',
      google_email: email,
      refresh_token: finalRefreshToken,
      access_token: accessToken,
      access_token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      granted_scopes: scope.split(' ').filter(Boolean),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,provider' });
    if (upsertErr) return redirectTo(returnTo || '/connectors', false, upsertErr.message);

    return redirectTo(returnTo || '/connectors', true);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return redirectTo('/connectors', false, msg);
  }
});
