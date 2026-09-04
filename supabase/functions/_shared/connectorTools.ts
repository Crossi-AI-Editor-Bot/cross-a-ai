// Runtime for the built-in Google connectors (Gmail + Drive). Users link
// their Google account from /connectors; once linked they can flip on
// gmail:read, gmail:write and/or drive:read, which lets the AI call
// /!gmail:read, /!gmail:write and /!drive:read the same way it calls any
// other /!tool. Tokens are stored per-user in public.user_connectors and are
// only ever touched here and in connectors-manage/google-oauth-callback,
// all of which run with the service-role key.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface ConnectorRow {
  user_id: string;
  google_email: string | null;
  refresh_token: string | null;
  access_token: string | null;
  access_token_expires_at: string | null;
  gmail_read_enabled: boolean;
  gmail_write_enabled: boolean;
  drive_read_enabled: boolean;
}

export type ConnectorToolResult = {
  status: number | null;
  body: string;
  errorKind?: 'timeout' | 'network' | 'http' | 'empty' | 'config' | 'unknown';
  errorMessage?: string;
};

const TOOL_TIMEOUT_MS = 15000;

/** Loads the caller's Google connector row, if any. */
export async function loadUserConnector(supabase: SupabaseClient, userId: string): Promise<ConnectorRow | null> {
  const { data } = await supabase
    .from('user_connectors')
    .select('user_id, google_email, refresh_token, access_token, access_token_expires_at, gmail_read_enabled, gmail_write_enabled, drive_read_enabled')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .maybeSingle();
  return (data as ConnectorRow) ?? null;
}

/** Builds the system-prompt lines describing the connector tools this user has enabled. */
export function buildConnectorToolLines(connector: ConnectorRow | null): string[] {
  if (!connector || !connector.refresh_token) return [];
  const lines: string[] = [];
  if (connector.gmail_read_enabled) {
    lines.push(`- /!gmail:read <query|"recent"> <max?>          — search/read the user's Gmail inbox (Gmail search syntax, e.g. "from:boss@x.com is:unread"). Example: /!gmail:read "is:unread" 5`);
  }
  if (connector.gmail_write_enabled) {
    lines.push(`- /!gmail:write <to> <subject> <body>            — send an email from the user's Gmail account. Example: /!gmail:write jane@example.com "Hi" "See you at 3pm"`);
  }
  if (connector.drive_read_enabled) {
    lines.push(`- /!drive:read <query|file_id> <max?>            — search the user's Google Drive files, or pass a file id to read its content. Example: /!drive:read "quarterly report" 5`);
  }
  return lines;
}

/** Regex matching any connector tool invocation this user has enabled. */
export function buildConnectorRegex(connector: ConnectorRow | null): RegExp | null {
  if (!connector || !connector.refresh_token) return null;
  const alts: string[] = [];
  if (connector.gmail_read_enabled) alts.push('gmail:read');
  if (connector.gmail_write_enabled) alts.push('gmail:write');
  if (connector.drive_read_enabled) alts.push('drive:read');
  if (!alts.length) return null;
  return new RegExp(`^\\s*\\/!(?:${alts.join('|')})\\b.*$`, 'gim');
}

/** Splits a raw argument string into tokens, honoring "quoted strings". */
function splitArgs(argsStr: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(argsStr.trim()))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

/** Returns a valid access token for the connector, refreshing it via the stored refresh_token if needed. */
async function getFreshAccessToken(supabase: SupabaseClient, connector: ConnectorRow): Promise<string> {
  const expiresAt = connector.access_token_expires_at ? new Date(connector.access_token_expires_at).getTime() : 0;
  if (connector.access_token && expiresAt - Date.now() > 60_000) {
    return connector.access_token;
  }
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';
  if (!clientId || !clientSecret) throw new Error('Google connector is not configured on the server (missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET).');
  if (!connector.refresh_token) throw new Error('No refresh token on file — reconnect the Google account.');

  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: connector.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Failed to refresh Google token: ${resp.status} ${t}`);
  }
  const json = await resp.json();
  const accessToken = json.access_token as string;
  const expiresIn = Number(json.expires_in ?? 3600);
  const newExpiry = new Date(Date.now() + expiresIn * 1000).toISOString();

  await supabase
    .from('user_connectors')
    .update({ access_token: accessToken, access_token_expires_at: newExpiry, updated_at: new Date().toISOString() })
    .eq('user_id', connector.user_id)
    .eq('provider', 'google');

  return accessToken;
}

function buildRawEmail(to: string, subject: string, body: string): string {
  const raw = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    body,
  ].join('\r\n');
  return btoa(unescape(encodeURIComponent(raw))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Executes a single connector tool invocation and returns a ToolResult-shaped object. */
export async function runConnectorTool(
  supabase: SupabaseClient,
  opts: { toolName: 'gmail:read' | 'gmail:write' | 'drive:read'; argsStr: string; connector: ConnectorRow | null },
): Promise<ConnectorToolResult> {
  const { toolName, argsStr, connector } = opts;
  if (!connector || !connector.refresh_token) {
    return { status: null, body: 'Google account not connected.', errorKind: 'config', errorMessage: `Connect Google on /connectors first, then enable ${toolName}.` };
  }
  const enabled =
    (toolName === 'gmail:read' && connector.gmail_read_enabled) ||
    (toolName === 'gmail:write' && connector.gmail_write_enabled) ||
    (toolName === 'drive:read' && connector.drive_read_enabled);
  if (!enabled) {
    return { status: 403, body: `${toolName} is not enabled.`, errorKind: 'config', errorMessage: `Enable ${toolName.split(':')[0]} on /connectors first.` };
  }

  let accessToken: string;
  try {
    accessToken = await getFreshAccessToken(supabase, connector);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: null, body: msg, errorKind: 'config', errorMessage: msg };
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TOOL_TIMEOUT_MS);
  try {
    if (toolName === 'gmail:read') {
      const args = splitArgs(argsStr);
      const query = args[0] && args[0].toLowerCase() !== 'recent' ? args[0] : '';
      const max = Math.max(1, Math.min(20, Number(args[1] ?? 5) || 5));
      const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${max}${query ? `&q=${encodeURIComponent(query)}` : ''}`;
      const listResp = await fetch(listUrl, { headers: { Authorization: `Bearer ${accessToken}` }, signal: ctrl.signal });
      const listJson = await listResp.json();
      if (!listResp.ok) return { status: listResp.status, body: JSON.stringify(listJson), errorKind: 'http', errorMessage: `Gmail API returned HTTP ${listResp.status}.` };
      const ids: string[] = (listJson.messages ?? []).map((m: any) => m.id);
      if (!ids.length) return { status: 200, body: '(no matching messages)', errorKind: 'empty', errorMessage: 'No messages matched.' };
      const summaries = await Promise.all(ids.map(async (id) => {
        const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const j = await r.json();
        const headers = (j.payload?.headers ?? []) as { name: string; value: string }[];
        const get = (n: string) => headers.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value ?? '';
        return `- [${id}] From: ${get('From')} | Subject: ${get('Subject')} | Date: ${get('Date')} | Snippet: ${j.snippet ?? ''}`;
      }));
      return { status: 200, body: summaries.join('\n') };
    }

    if (toolName === 'gmail:write') {
      const args = splitArgs(argsStr);
      const [to, subject, body] = [args[0], args[1], args.slice(2).join(' ')];
      if (!to || !subject || !body) return { status: null, body: 'Missing arguments.', errorKind: 'config', errorMessage: 'Usage: /!gmail:write <to> "<subject>" "<body>"' };
      const raw = buildRawEmail(to, subject, body);
      const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw }),
        signal: ctrl.signal,
      });
      const j = await r.json();
      if (!r.ok) return { status: r.status, body: JSON.stringify(j), errorKind: 'http', errorMessage: `Gmail send failed with HTTP ${r.status}.` };
      return { status: 200, body: `Email sent to ${to} (id: ${j.id}).` };
    }

    if (toolName === 'drive:read') {
      const args = splitArgs(argsStr);
      const query = args[0] ?? '';
      if (!query) return { status: null, body: 'Missing query.', errorKind: 'config', errorMessage: 'Usage: /!drive:read "<query or file id>" <max?>' };
      // Looks like a Drive file id (no spaces, fairly long alnum/_/-): try reading it directly first.
      if (/^[\w-]{20,}$/.test(query)) {
        const metaResp = await fetch(`https://www.googleapis.com/drive/v3/files/${query}?fields=id,name,mimeType,webViewLink`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: ctrl.signal,
        });
        if (metaResp.ok) {
          const meta = await metaResp.json();
          if (String(meta.mimeType).startsWith('application/vnd.google-apps')) {
            const exportMime = meta.mimeType.includes('spreadsheet') ? 'text/csv' : 'text/plain';
            const exportResp = await fetch(`https://www.googleapis.com/drive/v3/files/${query}/export?mimeType=${encodeURIComponent(exportMime)}`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            const text = await exportResp.text();
            return { status: 200, body: `File: ${meta.name}\n---\n${text.slice(0, 6000)}` };
          }
          const dlResp = await fetch(`https://www.googleapis.com/drive/v3/files/${query}?alt=media`, { headers: { Authorization: `Bearer ${accessToken}` } });
          const text = await dlResp.text();
          return { status: 200, body: `File: ${meta.name}\n---\n${text.slice(0, 6000)}` };
        }
        // Not a valid file id — fall through to search.
      }
      const max = Math.max(1, Math.min(20, Number(args[1] ?? 10) || 10));
      const searchUrl = `https://www.googleapis.com/drive/v3/files?pageSize=${max}&fields=files(id,name,mimeType,modifiedTime,webViewLink)&q=${encodeURIComponent(`name contains '${query.replace(/'/g, "\\'")}' and trashed = false`)}`;
      const r = await fetch(searchUrl, { headers: { Authorization: `Bearer ${accessToken}` }, signal: ctrl.signal });
      const j = await r.json();
      if (!r.ok) return { status: r.status, body: JSON.stringify(j), errorKind: 'http', errorMessage: `Drive API returned HTTP ${r.status}.` };
      const files = (j.files ?? []) as any[];
      if (!files.length) return { status: 200, body: '(no matching files)', errorKind: 'empty', errorMessage: 'No files matched.' };
      return { status: 200, body: files.map((f) => `- [${f.id}] ${f.name} (${f.mimeType}, modified ${f.modifiedTime})`).join('\n') };
    }

    return { status: null, body: 'Unknown connector tool.', errorKind: 'unknown', errorMessage: 'Unknown connector tool.' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const timeout = /abort/i.test(msg);
    return { status: null, body: msg, errorKind: timeout ? 'timeout' : 'unknown', errorMessage: timeout ? `${toolName} timed out after ${TOOL_TIMEOUT_MS / 1000}s.` : `Connector error: ${msg}` };
  } finally {
    clearTimeout(t);
  }
}
