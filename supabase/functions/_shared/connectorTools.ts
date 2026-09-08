// Runtime for the built-in GitHub connector. Users connect their GitHub
// account from /connectors; once linked they can enable individual actions
// (or "enable all" / "enable all repo" / "enable all account") and the AI
// can call each as its own tool: /!github:commit, /!github:issue_read,
// /!github:create_issue, /!github:profile, etc. Tokens + the set of enabled
// actions are stored per-user in public.user_connectors and are only ever
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
  enabled_actions: string[];
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
    .select('user_id, account_login, installation_id, access_token, refresh_token, access_token_expires_at, enabled_actions')
    .eq('user_id', userId)
    .eq('provider', 'github')
    .maybeSingle();
  return (data as ConnectorRow) ?? null;
}

// ---------------------------------------------------------------------------
// Action catalogue. Each entry is its own callable /!github:<name> tool and
// corresponds to one of the GitHub App permissions the site owner can grant
// on the "Permissions & events" page. `scope: "repo"` means the tool's first
// argument must be an <owner/repo>; `scope: "account"` means it acts on the
// signed-in user directly with no repo argument.
//
// Some permissions (Copilot Chat, Copilot Editor Context, Issue Fields,
// Issue Types, Models, Codespaces secrets, Agent secrets/tasks/variables,
// Attestations, Custom properties) don't have a stable, documented public
// REST endpoint suited to a one-shot tool call, so they aren't wired up here
// even if the permission is granted — add them the same way if/when GitHub
// exposes a usable endpoint.
// ---------------------------------------------------------------------------

type ActionCtx = { token: string; args: string[]; repo?: string; signal: AbortSignal };
type ActionDef = { scope: 'repo' | 'account'; label: string; usage: string; run: (ctx: ActionCtx) => Promise<ConnectorToolResult> };

async function gh(path: string, token: string, init: RequestInit = {}, signal?: AbortSignal) {
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

async function ghJson(path: string, token: string, init: RequestInit = {}, signal?: AbortSignal): Promise<{ ok: boolean; status: number; json: any }> {
  const r = await gh(path, token, init, signal);
  const json = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, json };
}

function listResult(status: number, ok: boolean, items: any[], format: (it: any) => string, emptyLabel: string): ConnectorToolResult {
  if (!ok) return { status, body: JSON.stringify(items), errorKind: 'http', errorMessage: `GitHub API returned HTTP ${status}.` };
  if (!items.length) return { status: 200, body: `(${emptyLabel})`, errorKind: 'empty', errorMessage: emptyLabel };
  return { status: 200, body: items.map(format).join('\n') };
}

export const ACTIONS: Record<string, ActionDef> = {
  // ---- Repository-scoped ---------------------------------------------
  repo_info: {
    scope: 'repo', label: 'Repo info', usage: '/!github:repo_info <owner/repo>',
    run: async ({ repo, token, signal }) => {
      const { ok, status, json } = await ghJson(`/repos/${repo}`, token, {}, signal);
      if (!ok) return { status, body: JSON.stringify(json), errorKind: 'http', errorMessage: `HTTP ${status}` };
      return { status: 200, body: `${json.full_name}: ${json.description || '(no description)'} | default branch: ${json.default_branch} | ${json.private ? 'private' : 'public'} | ${json.stargazers_count} stars` };
    },
  },
  read_file: {
    scope: 'repo', label: 'Read file (Contents)', usage: '/!github:read_file <owner/repo> <path>',
    run: async ({ repo, token, args, signal }) => {
      const path = args[0];
      if (!path) return { status: null, body: 'Missing path.', errorKind: 'config', errorMessage: 'Usage: /!github:read_file <owner/repo> <path>' };
      const { ok, status, json } = await ghJson(`/repos/${repo}/contents/${path}`, token, {}, signal);
      if (!ok) return { status, body: JSON.stringify(json), errorKind: 'http', errorMessage: `HTTP ${status}` };
      if (Array.isArray(json)) return { status: 200, body: json.map((f: any) => `- ${f.type}: ${f.path}`).join('\n') };
      const content = json.content ? atob(json.content.replace(/\n/g, '')) : '';
      return { status: 200, body: `File: ${json.path}\n---\n${content.slice(0, 6000)}` };
    },
  },
  commit: {
    scope: 'repo', label: 'Commit file (Contents)', usage: '/!github:commit <owner/repo> <path> "<commit message>" "<content>"',
    run: async ({ repo, token, args, signal }) => {
      const [path, message, ...rest] = args;
      const content = rest.join(' ');
      if (!path || !message || !content) return { status: null, body: 'Missing arguments.', errorKind: 'config', errorMessage: 'Usage: /!github:commit <owner/repo> <path> "<commit message>" "<content>"' };
      let sha: string | undefined;
      const existing = await gh(`/repos/${repo}/contents/${path}`, token, {}, signal);
      if (existing.ok) sha = (await existing.json()).sha;
      const encoded = btoa(unescape(encodeURIComponent(content)));
      const { ok, status, json } = await ghJson(`/repos/${repo}/contents/${path}`, token, { method: 'PUT', body: JSON.stringify({ message, content: encoded, sha }) }, signal);
      if (!ok) return { status, body: JSON.stringify(json), errorKind: 'http', errorMessage: `HTTP ${status}` };
      return { status: 200, body: `Wrote ${path}: ${json.content?.html_url ?? ''}` };
    },
  },
  actions_runs: {
    scope: 'repo', label: 'List workflow runs (Actions)', usage: '/!github:actions_runs <owner/repo>',
    run: async ({ repo, token, signal }) => {
      const { ok, status, json } = await ghJson(`/repos/${repo}/actions/runs?per_page=10`, token, {}, signal);
      return listResult(status, ok, json.workflow_runs ?? [], (r: any) => `- #${r.run_number} ${r.name} — ${r.status}/${r.conclusion ?? 'pending'} (${r.html_url})`, 'no workflow runs');
    },
  },
  actions_dispatch: {
    scope: 'repo', label: 'Dispatch workflow (Actions)', usage: '/!github:actions_dispatch <owner/repo> <workflow.yml> <ref?>',
    run: async ({ repo, token, args, signal }) => {
      const [workflowFile, ref = 'main'] = args;
      if (!workflowFile) return { status: null, body: 'Missing workflow file.', errorKind: 'config', errorMessage: 'Usage: /!github:actions_dispatch <owner/repo> <workflow.yml> <ref?>' };
      const { ok, status, json } = await ghJson(`/repos/${repo}/actions/workflows/${workflowFile}/dispatches`, token, { method: 'POST', body: JSON.stringify({ ref }) }, signal);
      if (!ok) return { status, body: JSON.stringify(json), errorKind: 'http', errorMessage: `HTTP ${status}` };
      return { status: 200, body: `Dispatched ${workflowFile} on ${ref}.` };
    },
  },
  collaborators: {
    scope: 'repo', label: 'List collaborators (Administration)', usage: '/!github:collaborators <owner/repo>',
    run: async ({ repo, token, signal }) => {
      const { ok, status, json } = await ghJson(`/repos/${repo}/collaborators`, token, {}, signal);
      return listResult(status, ok, json, (c: any) => `- ${c.login} (${c.permissions?.admin ? 'admin' : c.permissions?.push ? 'write' : 'read'})`, 'no collaborators');
    },
  },
  checks: {
    scope: 'repo', label: 'List check runs (Checks)', usage: '/!github:checks <owner/repo> <ref?>',
    run: async ({ repo, token, args, signal }) => {
      const ref = args[0] || 'HEAD';
      const { ok, status, json } = await ghJson(`/repos/${repo}/commits/${ref}/check-runs`, token, {}, signal);
      return listResult(status, ok, json.check_runs ?? [], (c: any) => `- ${c.name}: ${c.status}/${c.conclusion ?? 'pending'}`, 'no check runs');
    },
  },
  commit_statuses: {
    scope: 'repo', label: 'List commit statuses', usage: '/!github:commit_statuses <owner/repo> <ref?>',
    run: async ({ repo, token, args, signal }) => {
      const ref = args[0] || 'HEAD';
      const { ok, status, json } = await ghJson(`/repos/${repo}/commits/${ref}/statuses`, token, {}, signal);
      return listResult(status, ok, json, (s: any) => `- ${s.context}: ${s.state} — ${s.description ?? ''}`, 'no statuses');
    },
  },
  dependabot_alerts: {
    scope: 'repo', label: 'List Dependabot alerts', usage: '/!github:dependabot_alerts <owner/repo>',
    run: async ({ repo, token, signal }) => {
      const { ok, status, json } = await ghJson(`/repos/${repo}/dependabot/alerts?state=open`, token, {}, signal);
      return listResult(status, ok, Array.isArray(json) ? json : [], (a: any) => `- #${a.number} ${a.security_advisory?.summary} (${a.dependency?.package?.name})`, 'no open dependabot alerts');
    },
  },
  deployments_read: {
    scope: 'repo', label: 'List deployments', usage: '/!github:deployments_read <owner/repo>',
    run: async ({ repo, token, signal }) => {
      const { ok, status, json } = await ghJson(`/repos/${repo}/deployments?per_page=10`, token, {}, signal);
      return listResult(status, ok, json, (d: any) => `- ${d.id} → ${d.environment} (${d.ref})`, 'no deployments');
    },
  },
  deployments_create: {
    scope: 'repo', label: 'Create deployment', usage: '/!github:deployments_create <owner/repo> <ref> <environment?>',
    run: async ({ repo, token, args, signal }) => {
      const [ref, environment = 'production'] = args;
      if (!ref) return { status: null, body: 'Missing ref.', errorKind: 'config', errorMessage: 'Usage: /!github:deployments_create <owner/repo> <ref> <environment?>' };
      const { ok, status, json } = await ghJson(`/repos/${repo}/deployments`, token, { method: 'POST', body: JSON.stringify({ ref, environment, auto_merge: false }) }, signal);
      if (!ok) return { status, body: JSON.stringify(json), errorKind: 'http', errorMessage: `HTTP ${status}` };
      return { status: 200, body: `Created deployment ${json.id} on ${environment}.` };
    },
  },
  discussions: {
    scope: 'repo', label: 'List discussions', usage: '/!github:discussions <owner/repo>',
    run: async ({ repo, token, signal }) => {
      const [owner, name] = (repo as string).split('/');
      const query = `query($owner:String!,$name:String!){repository(owner:$owner,name:$name){discussions(first:10){nodes{title url}}}}`;
      const { ok, status, json } = await ghJson(`/graphql`, token, { method: 'POST', body: JSON.stringify({ query, variables: { owner, name } }) }, signal);
      const nodes = json?.data?.repository?.discussions?.nodes ?? [];
      return listResult(status, ok, nodes, (d: any) => `- ${d.title} (${d.url})`, 'no discussions');
    },
  },
  environments: {
    scope: 'repo', label: 'List environments', usage: '/!github:environments <owner/repo>',
    run: async ({ repo, token, signal }) => {
      const { ok, status, json } = await ghJson(`/repos/${repo}/environments`, token, {}, signal);
      return listResult(status, ok, json.environments ?? [], (e: any) => `- ${e.name}`, 'no environments');
    },
  },
  issue_read: {
    scope: 'repo', label: 'List open issues', usage: '/!github:issue_read <owner/repo> <max?>',
    run: async ({ repo, token, args, signal }) => {
      const max = Math.max(1, Math.min(20, Number(args[0] ?? 10) || 10));
      const { ok, status, json } = await ghJson(`/repos/${repo}/issues?state=open&per_page=${max}`, token, {}, signal);
      const issues = (Array.isArray(json) ? json : []).filter((it: any) => !it.pull_request);
      return listResult(status, ok, issues, (it: any) => `- #${it.number} ${it.title} (by ${it.user?.login}) — ${it.html_url}`, 'no open issues');
    },
  },
  create_issue: {
    scope: 'repo', label: 'Create issue', usage: '/!github:create_issue <owner/repo> "<title>" "<body>"',
    run: async ({ repo, token, args, signal }) => {
      const [title, ...rest] = args;
      const body = rest.join(' ');
      if (!title) return { status: null, body: 'Missing title.', errorKind: 'config', errorMessage: 'Usage: /!github:create_issue <owner/repo> "<title>" "<body>"' };
      const { ok, status, json } = await ghJson(`/repos/${repo}/issues`, token, { method: 'POST', body: JSON.stringify({ title, body }) }, signal);
      if (!ok) return { status, body: JSON.stringify(json), errorKind: 'http', errorMessage: `HTTP ${status}` };
      return { status: 200, body: `Created issue #${json.number}: ${json.html_url}` };
    },
  },
  comment_issue: {
    scope: 'repo', label: 'Comment on issue', usage: '/!github:comment_issue <owner/repo> <issue#> "<body>"',
    run: async ({ repo, token, args, signal }) => {
      const [issueNumber, ...rest] = args;
      const body = rest.join(' ');
      if (!issueNumber || !body) return { status: null, body: 'Missing issue number or body.', errorKind: 'config', errorMessage: 'Usage: /!github:comment_issue <owner/repo> <issue#> "<body>"' };
      const { ok, status, json } = await ghJson(`/repos/${repo}/issues/${issueNumber}/comments`, token, { method: 'POST', body: JSON.stringify({ body }) }, signal);
      if (!ok) return { status, body: JSON.stringify(json), errorKind: 'http', errorMessage: `HTTP ${status}` };
      return { status: 200, body: `Commented on #${issueNumber}: ${json.html_url}` };
    },
  },
  packages: {
    scope: 'repo', label: 'List packages', usage: '/!github:packages <owner/repo>',
    run: async ({ repo, token, signal }) => {
      const [owner] = (repo as string).split('/');
      const { ok, status, json } = await ghJson(`/orgs/${owner}/packages?per_page=20`, token, {}, signal);
      return listResult(status, ok, Array.isArray(json) ? json : [], (p: any) => `- ${p.name} (${p.package_type})`, 'no packages found');
    },
  },
  pages: {
    scope: 'repo', label: 'GitHub Pages status', usage: '/!github:pages <owner/repo>',
    run: async ({ repo, token, signal }) => {
      const { ok, status, json } = await ghJson(`/repos/${repo}/pages`, token, {}, signal);
      if (!ok) return { status, body: JSON.stringify(json), errorKind: 'http', errorMessage: `HTTP ${status}` };
      return { status: 200, body: `Pages site: ${json.html_url} (status: ${json.status})` };
    },
  },
  projects: {
    scope: 'repo', label: 'List classic projects', usage: '/!github:projects <owner/repo>',
    run: async ({ repo, token, signal }) => {
      const { ok, status, json } = await ghJson(`/repos/${repo}/projects`, token, {}, signal);
      return listResult(status, ok, Array.isArray(json) ? json : [], (p: any) => `- ${p.name}: ${p.html_url}`, 'no classic projects');
    },
  },
  pr_read: {
    scope: 'repo', label: 'List open pull requests', usage: '/!github:pr_read <owner/repo> <max?>',
    run: async ({ repo, token, args, signal }) => {
      const max = Math.max(1, Math.min(20, Number(args[0] ?? 10) || 10));
      const { ok, status, json } = await ghJson(`/repos/${repo}/pulls?state=open&per_page=${max}`, token, {}, signal);
      return listResult(status, ok, Array.isArray(json) ? json : [], (p: any) => `- #${p.number} ${p.title} (${p.head.ref} → ${p.base.ref}) — ${p.html_url}`, 'no open pull requests');
    },
  },
  create_pr: {
    scope: 'repo', label: 'Create pull request', usage: '/!github:create_pr <owner/repo> <head-branch> <base-branch> "<title>" "<body>"',
    run: async ({ repo, token, args, signal }) => {
      const [head, base = 'main', title, ...rest] = args;
      const body = rest.join(' ');
      if (!head || !title) return { status: null, body: 'Missing arguments.', errorKind: 'config', errorMessage: 'Usage: /!github:create_pr <owner/repo> <head-branch> <base-branch> "<title>" "<body>"' };
      const { ok, status, json } = await ghJson(`/repos/${repo}/pulls`, token, { method: 'POST', body: JSON.stringify({ head, base, title, body }) }, signal);
      if (!ok) return { status, body: JSON.stringify(json), errorKind: 'http', errorMessage: `HTTP ${status}` };
      return { status: 200, body: `Opened PR #${json.number}: ${json.html_url}` };
    },
  },
  secret_scanning_alerts: {
    scope: 'repo', label: 'List secret scanning alerts', usage: '/!github:secret_scanning_alerts <owner/repo>',
    run: async ({ repo, token, signal }) => {
      const { ok, status, json } = await ghJson(`/repos/${repo}/secret-scanning/alerts?state=open`, token, {}, signal);
      return listResult(status, ok, Array.isArray(json) ? json : [], (a: any) => `- #${a.number} ${a.secret_type} (${a.state})`, 'no open secret scanning alerts');
    },
  },
  security_advisories: {
    scope: 'repo', label: 'List security advisories', usage: '/!github:security_advisories <owner/repo>',
    run: async ({ repo, token, signal }) => {
      const { ok, status, json } = await ghJson(`/repos/${repo}/security-advisories`, token, {}, signal);
      return listResult(status, ok, Array.isArray(json) ? json : [], (a: any) => `- ${a.summary} (${a.severity})`, 'no security advisories');
    },
  },
  webhooks: {
    scope: 'repo', label: 'List webhooks', usage: '/!github:webhooks <owner/repo>',
    run: async ({ repo, token, signal }) => {
      const { ok, status, json } = await ghJson(`/repos/${repo}/hooks`, token, {}, signal);
      return listResult(status, ok, Array.isArray(json) ? json : [], (h: any) => `- ${h.config?.url} (active: ${h.active})`, 'no webhooks');
    },
  },
  workflows: {
    scope: 'repo', label: 'List workflows', usage: '/!github:workflows <owner/repo>',
    run: async ({ repo, token, signal }) => {
      const { ok, status, json } = await ghJson(`/repos/${repo}/actions/workflows`, token, {}, signal);
      return listResult(status, ok, json.workflows ?? [], (w: any) => `- ${w.name} (${w.path}) — ${w.state}`, 'no workflows');
    },
  },

  // ---- Account-scoped -------------------------------------------------
  profile: {
    scope: 'account', label: 'Profile', usage: '/!github:profile',
    run: async ({ token, signal }) => {
      const { ok, status, json } = await ghJson('/user', token, {}, signal);
      if (!ok) return { status, body: JSON.stringify(json), errorKind: 'http', errorMessage: `HTTP ${status}` };
      return { status: 200, body: `${json.login} (${json.name || 'no name set'}) — ${json.bio || 'no bio'} | followers: ${json.followers} | public repos: ${json.public_repos}` };
    },
  },
  plan: {
    scope: 'account', label: 'Plan', usage: '/!github:plan',
    run: async ({ token, signal }) => {
      const { ok, status, json } = await ghJson('/user', token, {}, signal);
      if (!ok) return { status, body: JSON.stringify(json), errorKind: 'http', errorMessage: `HTTP ${status}` };
      return { status: 200, body: json.plan ? `Plan: ${json.plan.name} (private repos: ${json.plan.private_repos})` : 'No plan info available.' };
    },
  },
  emails: {
    scope: 'account', label: 'Email addresses', usage: '/!github:emails',
    run: async ({ token, signal }) => {
      const { ok, status, json } = await ghJson('/user/emails', token, {}, signal);
      return listResult(status, ok, Array.isArray(json) ? json : [], (e: any) => `- ${e.email}${e.primary ? ' (primary)' : ''}${e.verified ? ' verified' : ' unverified'}`, 'no emails found');
    },
  },
  followers: {
    scope: 'account', label: 'Followers', usage: '/!github:followers',
    run: async ({ token, signal }) => {
      const { ok, status, json } = await ghJson('/user/followers?per_page=20', token, {}, signal);
      return listResult(status, ok, Array.isArray(json) ? json : [], (u: any) => `- ${u.login}`, 'no followers');
    },
  },
  events: {
    scope: 'account', label: 'Recent events', usage: '/!github:events',
    run: async ({ token, signal }) => {
      const me = await ghJson('/user', token, {}, signal);
      if (!me.ok) return { status: me.status, body: JSON.stringify(me.json), errorKind: 'http', errorMessage: `HTTP ${me.status}` };
      const { ok, status, json } = await ghJson(`/users/${me.json.login}/events?per_page=15`, token, {}, signal);
      return listResult(status, ok, Array.isArray(json) ? json : [], (e: any) => `- ${e.type} on ${e.repo?.name} (${e.created_at})`, 'no recent events');
    },
  },
  gpg_keys: {
    scope: 'account', label: 'GPG keys', usage: '/!github:gpg_keys',
    run: async ({ token, signal }) => {
      const { ok, status, json } = await ghJson('/user/gpg_keys', token, {}, signal);
      return listResult(status, ok, Array.isArray(json) ? json : [], (k: any) => `- ${k.key_id} (${k.emails?.map((e: any) => e.email).join(', ')})`, 'no GPG keys');
    },
  },
  ssh_keys: {
    scope: 'account', label: 'Git SSH keys', usage: '/!github:ssh_keys',
    run: async ({ token, signal }) => {
      const { ok, status, json } = await ghJson('/user/keys', token, {}, signal);
      return listResult(status, ok, Array.isArray(json) ? json : [], (k: any) => `- ${k.title}: ${k.key.slice(0, 40)}…`, 'no SSH keys');
    },
  },
  ssh_signing_keys: {
    scope: 'account', label: 'SSH signing keys', usage: '/!github:ssh_signing_keys',
    run: async ({ token, signal }) => {
      const { ok, status, json } = await ghJson('/user/ssh_signing_keys', token, {}, signal);
      return listResult(status, ok, Array.isArray(json) ? json : [], (k: any) => `- ${k.title}`, 'no SSH signing keys');
    },
  },
  gists_read: {
    scope: 'account', label: 'List gists', usage: '/!github:gists_read',
    run: async ({ token, signal }) => {
      const { ok, status, json } = await ghJson('/gists', token, {}, signal);
      return listResult(status, ok, Array.isArray(json) ? json : [], (g: any) => `- ${g.description || '(no description)'} — ${g.html_url}`, 'no gists');
    },
  },
  create_gist: {
    scope: 'account', label: 'Create gist', usage: '/!github:create_gist <filename> "<description>" "<content>"',
    run: async ({ token, args, signal }) => {
      const [filename, description, ...rest] = args;
      const content = rest.join(' ');
      if (!filename || !content) return { status: null, body: 'Missing arguments.', errorKind: 'config', errorMessage: 'Usage: /!github:create_gist <filename> "<description>" "<content>"' };
      const { ok, status, json } = await ghJson('/gists', token, { method: 'POST', body: JSON.stringify({ description, public: false, files: { [filename]: { content } } }) }, signal);
      if (!ok) return { status, body: JSON.stringify(json), errorKind: 'http', errorMessage: `HTTP ${status}` };
      return { status: 200, body: `Created gist: ${json.html_url}` };
    },
  },
  starred: {
    scope: 'account', label: 'Starred repos', usage: '/!github:starred',
    run: async ({ token, signal }) => {
      const { ok, status, json } = await ghJson('/user/starred?per_page=20', token, {}, signal);
      return listResult(status, ok, Array.isArray(json) ? json : [], (r: any) => `- ${r.full_name}`, 'no starred repos');
    },
  },
  star_repo: {
    scope: 'account', label: 'Star a repo', usage: '/!github:star_repo <owner/repo>',
    run: async ({ token, args, signal }) => {
      const repo = args[0];
      if (!repo) return { status: null, body: 'Missing repo.', errorKind: 'config', errorMessage: 'Usage: /!github:star_repo <owner/repo>' };
      const r = await gh(`/user/starred/${repo}`, token, { method: 'PUT' }, signal);
      if (!r.ok && r.status !== 204) return { status: r.status, body: await r.text(), errorKind: 'http', errorMessage: `HTTP ${r.status}` };
      return { status: 200, body: `Starred ${repo}.` };
    },
  },
  watching: {
    scope: 'account', label: 'Watched repos', usage: '/!github:watching',
    run: async ({ token, signal }) => {
      const { ok, status, json } = await ghJson('/user/subscriptions?per_page=20', token, {}, signal);
      return listResult(status, ok, Array.isArray(json) ? json : [], (r: any) => `- ${r.full_name}`, 'not watching any repos');
    },
  },
  watch_repo: {
    scope: 'account', label: 'Watch a repo', usage: '/!github:watch_repo <owner/repo>',
    run: async ({ token, args, signal }) => {
      const repo = args[0];
      if (!repo) return { status: null, body: 'Missing repo.', errorKind: 'config', errorMessage: 'Usage: /!github:watch_repo <owner/repo>' };
      const { ok, status, json } = await ghJson(`/repos/${repo}/subscription`, token, { method: 'PUT', body: JSON.stringify({ subscribed: true }) }, signal);
      if (!ok) return { status, body: JSON.stringify(json), errorKind: 'http', errorMessage: `HTTP ${status}` };
      return { status: 200, body: `Now watching ${repo}.` };
    },
  },
  interaction_limits: {
    scope: 'account', label: 'Interaction limits', usage: '/!github:interaction_limits',
    run: async ({ token, signal }) => {
      const { ok, status, json } = await ghJson('/user/interaction-limits', token, {}, signal);
      if (status === 204) return { status: 200, body: 'No interaction limit currently set.' };
      if (!ok) return { status, body: JSON.stringify(json), errorKind: 'http', errorMessage: `HTTP ${status}` };
      return { status: 200, body: `Limit: ${json.limit} (expires ${json.expires_at})` };
    },
  },
  blocked_users: {
    scope: 'account', label: 'Blocked users', usage: '/!github:blocked_users',
    run: async ({ token, signal }) => {
      const { ok, status, json } = await ghJson('/user/blocks', token, {}, signal);
      return listResult(status, ok, Array.isArray(json) ? json : [], (u: any) => `- ${u.login}`, 'no blocked users');
    },
  },
  block_user: {
    scope: 'account', label: 'Block a user', usage: '/!github:block_user <username>',
    run: async ({ token, args, signal }) => {
      const username = args[0];
      if (!username) return { status: null, body: 'Missing username.', errorKind: 'config', errorMessage: 'Usage: /!github:block_user <username>' };
      const r = await gh(`/user/blocks/${username}`, token, { method: 'PUT' }, signal);
      if (!r.ok && r.status !== 204) return { status: r.status, body: await r.text(), errorKind: 'http', errorMessage: `HTTP ${r.status}` };
      return { status: 200, body: `Blocked ${username}.` };
    },
  },
};

export const REPO_ACTION_NAMES = Object.entries(ACTIONS).filter(([, d]) => d.scope === 'repo').map(([k]) => k);
export const ACCOUNT_ACTION_NAMES = Object.entries(ACTIONS).filter(([, d]) => d.scope === 'account').map(([k]) => k);
export const ALL_ACTION_NAMES = Object.keys(ACTIONS);

/** Builds the system-prompt lines describing the connector tools this user has enabled. */
export function buildConnectorToolLines(connector: ConnectorRow | null): string[] {
  if (!connector || !connector.access_token) return [];
  const enabled = new Set(connector.enabled_actions || []);
  return Object.entries(ACTIONS)
    .filter(([name]) => enabled.has(name))
    .map(([name, def]) => `- ${def.usage}   — ${def.label}${def.scope === 'repo' ? '' : ' (account-wide, no repo needed)'}.`);
}

/** Regex matching any connector tool invocation this user has enabled. */
export function buildConnectorRegex(connector: ConnectorRow | null): RegExp | null {
  if (!connector || !connector.access_token) return null;
  const enabled = (connector.enabled_actions || []).filter((n) => ACTIONS[n]);
  if (!enabled.length) return null;
  return new RegExp(`^\\s*\\/!github:(?:${enabled.join('|')})\\b.*$`, 'gim');
}

/** Splits a raw argument string into tokens, honoring "quoted strings". */
function splitArgs(argsStr: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(argsStr.trim()))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

/** Executes a single /!github:<action> invocation and returns a ToolResult-shaped object. */
export async function runConnectorTool(
  opts: { action: string; argsStr: string; connector: ConnectorRow | null },
): Promise<ConnectorToolResult> {
  const { action, argsStr, connector } = opts;
  if (!connector || !connector.access_token) {
    return { status: null, body: 'GitHub account not connected.', errorKind: 'config', errorMessage: `Connect GitHub on /connectors first, then enable /!github:${action}.` };
  }
  const def = ACTIONS[action];
  if (!def) return { status: null, body: `Unknown action "${action}".`, errorKind: 'config', errorMessage: `Unknown GitHub action. Available: ${ALL_ACTION_NAMES.join(', ')}` };
  if (!(connector.enabled_actions || []).includes(action)) {
    return { status: 403, body: `github:${action} is not enabled.`, errorKind: 'config', errorMessage: `Enable "${def.label}" on /connectors first.` };
  }

  const token = connector.access_token;
  const rawArgs = splitArgs(argsStr);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TOOL_TIMEOUT_MS);
  try {
    if (def.scope === 'repo') {
      const [repo, ...rest] = rawArgs;
      if (!repo || !repo.includes('/')) return { status: null, body: 'Missing or invalid repo.', errorKind: 'config', errorMessage: `Usage: ${def.usage}` };
      return await def.run({ token, args: rest, repo, signal: ctrl.signal });
    }
    return await def.run({ token, args: rawArgs, signal: ctrl.signal });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const timeout = /abort/i.test(msg);
    return { status: null, body: msg, errorKind: timeout ? 'timeout' : 'unknown', errorMessage: timeout ? `github:${action} timed out after ${TOOL_TIMEOUT_MS / 1000}s.` : `Connector error: ${msg}` };
  } finally {
    clearTimeout(t);
  }
}
