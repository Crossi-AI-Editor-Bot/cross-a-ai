// Runtime for the built-in GitHub connector. Users connect their GitHub
// account from /connectors by authorizing a GitHub App; once linked they can
// flip on github:read and/or github:write, which lets the AI call
// /!github:read and /!github:write the same way it calls any other /!tool.
// Tokens are stored per-user in public.user_connectors and are only ever
// touched here and in connectors-manage/github-oauth-callback, all of which
// run with the service-role key.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface ConnectorRow {
  user_id: string;
  account_login: string | null;
  installation_id: string | null;
  access_token: string | null;
  refresh_token: string | null;
  access_token_expires_at: string | null;
  github_read_enabled: boolean;
  github_write_enabled: boolean;
}

export type ConnectorToolResult = {
  status: number | null;
  body: string;
  errorKind?: 'timeout' | 'network' | 'http' | 'empty' | 'config' | 'unknown';
  errorMessage?: string;
};

const TOOL_TIMEOUT_MS = 15000;
const GITHUB_API = 'https://api.github.com';

/** Loads the caller's GitHub connector row, if any. */
export async function loadUserConnector(supabase: SupabaseClient, userId: string): Promise<ConnectorRow | null> {
  const { data } = await supabase
    .from('user_connectors')
    .select('user_id, account_login, installation_id, access_token, refresh_token, access_token_expires_at, github_read_enabled, github_write_enabled')
    .eq('user_id', userId)
    .eq('provider', 'github')
    .maybeSingle();
  return (data as ConnectorRow) ?? null;
}

/** Builds the system-prompt lines describing the connector tools this user has enabled. */
export function buildConnectorToolLines(connector: ConnectorRow | null): string[] {
  if (!connector || !connector.access_token) return [];
  const lines: string[] = [];
  if (connector.github_read_enabled) {
    lines.push(`- /!github:read <owner/repo> <"issues"|"file:<path>"|"search:<query>">   — read from the user's GitHub. Examples: /!github:read acme/site issues | /!github:read acme/site file:README.md | /!github:read acme/site search:"TODO"`);
  }
  if (connector.github_write_enabled) {
    lines.push(`- /!github:write <owner/repo> <"issue"|"comment:<issue#>"|"file:<path>"> <title|body> <body?>   — write to the user's GitHub. Examples: /!github:write acme/site issue "Bug title" "Steps to repro" | /!github:write acme/site comment:12 "Looks good!" | /!github:write acme/site file:notes.md "commit message" "file contents"`);
  }
  return lines;
}

/** Regex matching any connector tool invocation this user has enabled. */
export function buildConnectorRegex(connector: ConnectorRow | null): RegExp | null {
  if (!connector || !connector.access_token) return null;
  const alts: string[] = [];
  if (connector.github_read_enabled) alts.push('github:read');
  if (connector.github_write_enabled) alts.push('github:write');
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

async function ghFetch(path: string, token: string, init: RequestInit = {}, signal?: AbortSignal) {
  return fetch(`${GITHUB_API}${path}`, {
    ...init,
    signal,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers || {}),
    },
  });
}

/** Executes a single connector tool invocation and returns a ToolResult-shaped object. */
export async function runConnectorTool(
  supabase: SupabaseClient,
  opts: { toolName: 'github:read' | 'github:write'; argsStr: string; connector: ConnectorRow | null },
): Promise<ConnectorToolResult> {
  const { toolName, argsStr, connector } = opts;
  if (!connector || !connector.access_token) {
    return { status: null, body: 'GitHub account not connected.', errorKind: 'config', errorMessage: `Connect GitHub on /connectors first, then enable ${toolName}.` };
  }
  const enabled =
    (toolName === 'github:read' && connector.github_read_enabled) ||
    (toolName === 'github:write' && connector.github_write_enabled);
  if (!enabled) {
    return { status: 403, body: `${toolName} is not enabled.`, errorKind: 'config', errorMessage: `Enable ${toolName.split(':')[1]} access on /connectors first.` };
  }

  const token = connector.access_token;
  const args = splitArgs(argsStr);
  const repo = args[0];
  if (!repo || !repo.includes('/')) {
    return { status: null, body: 'Missing or invalid repo.', errorKind: 'config', errorMessage: `Usage: /!${toolName} <owner/repo> ...` };
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TOOL_TIMEOUT_MS);
  try {
    if (toolName === 'github:read') {
      const mode = (args[1] || 'issues').toLowerCase();

      if (mode.startsWith('file:')) {
        const path = mode.slice(5);
        const r = await ghFetch(`/repos/${repo}/contents/${path}`, token, {}, ctrl.signal);
        const j = await r.json();
        if (!r.ok) return { status: r.status, body: JSON.stringify(j), errorKind: 'http', errorMessage: `GitHub API returned HTTP ${r.status}.` };
        if (Array.isArray(j)) return { status: 200, body: j.map((f: any) => `- ${f.type}: ${f.path}`).join('\n') };
        const content = j.content ? atob(j.content.replace(/\n/g, '')) : '';
        return { status: 200, body: `File: ${j.path}\n---\n${content.slice(0, 6000)}` };
      }

      if (mode.startsWith('search:')) {
        const q = mode.slice(7);
        const r = await ghFetch(`/search/code?q=${encodeURIComponent(`${q} repo:${repo}`)}`, token, {}, ctrl.signal);
        const j = await r.json();
        if (!r.ok) return { status: r.status, body: JSON.stringify(j), errorKind: 'http', errorMessage: `GitHub search returned HTTP ${r.status}.` };
        const items = (j.items ?? []) as any[];
        if (!items.length) return { status: 200, body: '(no matches)', errorKind: 'empty', errorMessage: 'No matches.' };
        return { status: 200, body: items.slice(0, 15).map((it) => `- ${it.path}`).join('\n') };
      }

      // default: list issues
      const max = Math.max(1, Math.min(20, Number(args[2] ?? 10) || 10));
      const r = await ghFetch(`/repos/${repo}/issues?state=open&per_page=${max}`, token, {}, ctrl.signal);
      const j = await r.json();
      if (!r.ok) return { status: r.status, body: JSON.stringify(j), errorKind: 'http', errorMessage: `GitHub API returned HTTP ${r.status}.` };
      const issues = (j as any[]).filter((it) => !it.pull_request);
      if (!issues.length) return { status: 200, body: '(no open issues)', errorKind: 'empty', errorMessage: 'No open issues.' };
      return { status: 200, body: issues.map((it) => `- #${it.number} ${it.title} (by ${it.user?.login}) — ${it.html_url}`).join('\n') };
    }

    if (toolName === 'github:write') {
      const mode = (args[1] || '').toLowerCase();

      if (mode === 'issue') {
        const title = args[2];
        const body = args.slice(3).join(' ');
        if (!title) return { status: null, body: 'Missing title.', errorKind: 'config', errorMessage: 'Usage: /!github:write <owner/repo> issue "<title>" "<body>"' };
        const r = await ghFetch(`/repos/${repo}/issues`, token, { method: 'POST', body: JSON.stringify({ title, body }) }, ctrl.signal);
        const j = await r.json();
        if (!r.ok) return { status: r.status, body: JSON.stringify(j), errorKind: 'http', errorMessage: `GitHub issue creation failed with HTTP ${r.status}.` };
        return { status: 200, body: `Created issue #${j.number}: ${j.html_url}` };
      }

      if (mode.startsWith('comment:')) {
        const issueNumber = mode.slice(8);
        const body = args.slice(2).join(' ');
        if (!issueNumber || !body) return { status: null, body: 'Missing issue number or body.', errorKind: 'config', errorMessage: 'Usage: /!github:write <owner/repo> comment:<issue#> "<body>"' };
        const r = await ghFetch(`/repos/${repo}/issues/${issueNumber}/comments`, token, { method: 'POST', body: JSON.stringify({ body }) }, ctrl.signal);
        const j = await r.json();
        if (!r.ok) return { status: r.status, body: JSON.stringify(j), errorKind: 'http', errorMessage: `GitHub comment failed with HTTP ${r.status}.` };
        return { status: 200, body: `Commented on #${issueNumber}: ${j.html_url}` };
      }

      if (mode.startsWith('file:')) {
        const path = mode.slice(5);
        const message = args[2];
        const content = args.slice(3).join(' ');
        if (!path || !message || !content) return { status: null, body: 'Missing arguments.', errorKind: 'config', errorMessage: 'Usage: /!github:write <owner/repo> file:<path> "<commit message>" "<content>"' };
        // Need the current file sha if it already exists, to update rather than create.
        let sha: string | undefined;
        const existing = await ghFetch(`/repos/${repo}/contents/${path}`, token, {}, ctrl.signal);
        if (existing.ok) sha = (await existing.json()).sha;
        const encoded = btoa(unescape(encodeURIComponent(content)));
        const r = await ghFetch(`/repos/${repo}/contents/${path}`, token, {
          method: 'PUT',
          body: JSON.stringify({ message, content: encoded, sha }),
        }, ctrl.signal);
        const j = await r.json();
        if (!r.ok) return { status: r.status, body: JSON.stringify(j), errorKind: 'http', errorMessage: `GitHub file write failed with HTTP ${r.status}.` };
        return { status: 200, body: `Wrote ${path}: ${j.content?.html_url ?? ''}` };
      }

      return { status: null, body: 'Unknown write mode.', errorKind: 'config', errorMessage: 'Usage: /!github:write <owner/repo> <issue|comment:<n>|file:<path>> ...' };
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
