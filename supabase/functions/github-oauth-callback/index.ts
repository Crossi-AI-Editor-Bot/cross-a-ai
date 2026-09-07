// The callback URL GitHub sends the browser back to after the user
// authorizes (and optionally installs) the GitHub App. Verifies the signed
// `state`, exchanges the `code` for a user access token, records the
// installation id if GitHub included one, and upserts everything into
// public.user_connectors for that user. Then redirects back to /connectors
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
  const installationId = reqUrl.searchParams.get('installation_id');
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

    const clientId = Deno.env.get('GITHUB_APP_CLIENT_ID') ?? '';
    const clientSecret = Deno.env.get('GITHUB_APP_CLIENT_SECRET') ?? '';

    const tokenResp = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code }),
    });
    const tokenJson = await tokenResp.json();
    if (!tokenResp.ok || tokenJson.error) return redirectTo(returnTo || '/connectors', false, tokenJson.error_description || tokenJson.error || 'Token exchange failed.');

    const accessToken = tokenJson.access_token as string;
    const refreshToken = tokenJson.refresh_token as string | undefined; // only present if "expire user tokens" is enabled on the app
    const expiresIn = tokenJson.expires_in ? Number(tokenJson.expires_in) : null;
    const scope = String(tokenJson.scope ?? '');

    let login: string | null = null;
    try {
      const meResp = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' },
      });
      if (meResp.ok) login = (await meResp.json()).login ?? null;
    } catch {
      // non-fatal
    }

    // If GitHub didn't hand us an installation id on this round-trip (e.g.
    // the user had already installed the app previously), look it up.
    let resolvedInstallationId = installationId;
    if (!resolvedInstallationId) {
      try {
        const instResp = await fetch('https://api.github.com/user/installations', {
          headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json' },
        });
        if (instResp.ok) {
          const instJson = await instResp.json();
          resolvedInstallationId = instJson.installations?.[0]?.id ? String(instJson.installations[0].id) : null;
        }
      } catch {
        // non-fatal — repo tools will just work against whatever the user token can already see
      }
    }

    const { error: upsertErr } = await admin.from('user_connectors').upsert({
      user_id: userId,
      provider: 'github',
      account_login: login,
      installation_id: resolvedInstallationId,
      access_token: accessToken,
      refresh_token: refreshToken ?? null,
      access_token_expires_at: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
      granted_scopes: scope.split(',').filter(Boolean),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,provider' });
    if (upsertErr) return redirectTo(returnTo || '/connectors', false, upsertErr.message);

    return redirectTo(returnTo || '/connectors', true);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return redirectTo('/connectors', false, msg);
  }
});
