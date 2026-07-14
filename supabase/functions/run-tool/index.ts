// Retry endpoint for /!csearch and /!web tool invocations from the chat UI.
// Keeps parity with the inline runTool in supabase/functions/chat/index.ts.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const TOOL_TIMEOUT_MS = 15000;

const withTimeout = async (fn: (signal: AbortSignal) => Promise<Response>) => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TOOL_TIMEOUT_MS);
  try { return await fn(ctrl.signal); } finally { clearTimeout(t); }
};

const isEmptyPayload = (body: string): boolean => {
  const s = body.trim();
  if (!s) return true;
  try {
    const j = JSON.parse(s);
    if (Array.isArray(j) && j.length === 0) return true;
    if (j && typeof j === "object") {
      const arr = (j as any).results ?? (j as any).items ?? (j as any).data ?? (j as any).hits;
      if (Array.isArray(arr) && arr.length === 0) return true;
      if ((j as any).total === 0 || (j as any).count === 0) return true;
    }
  } catch { /* not JSON */ }
  return false;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const { tool, args } = await req.json();
    if (!tool || typeof args !== 'string') return new Response(JSON.stringify({ error: 'tool and args required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const CROSSISEARCH_KEY = Deno.env.get('CROSSISEARCH_KEY');
    const CC_DATA_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3ZXdrZG9sbW5yam1ncGx6eHJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1NzE3MTQsImV4cCI6MjA3NzE0NzcxNH0.mtZiST9pfc5DLokcdY0OMAXlpSK1ftkHJY020u1DXQc";
    const CC_DATA_API_BASE = "https://kwewkdolmnrjmgplzxrk.supabase.co/rest/v1/rpc/data_api";
    const CC_ACTIONS: Record<string, string> = { ccvideo: 'video', ccpost: 'post', ccsong: 'song', ccstream: 'livestream' };
    const started = Date.now();
    let status: number | null = null;
    let body = '';
    let errorKind: string | null = null;
    let errorMessage: string | null = null;

    try {
      if (tool === 'csearch') {
        const cs = args.match(/^\/!csearch\s+"([^"]+)"\s+(\S+)\s+(\d+)/i) || args.match(/^\/!csearch\s+(\S+)\s+(\S+)\s+(\d+)/i);
        if (!cs) throw new Error('Malformed csearch arguments');
        if (!CROSSISEARCH_KEY) { errorKind = 'config'; errorMessage = 'Search backend not configured.'; }
        else {
          const [, query, kindRaw, limit] = cs;
          const kind = /^file/i.test(kindRaw) ? 'file' : 'page';
          const r = await withTimeout((signal) => fetch('https://crossisearch.lovable.app/api/public/search', {
            method: 'POST', signal,
            headers: { 'x-api-key': CROSSISEARCH_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, kind, limit: Number(limit) }),
          }));
          status = r.status; body = await r.text();
          if (!r.ok) { errorKind = 'http'; errorMessage = `Search returned HTTP ${r.status}.`; }
          else if (isEmptyPayload(body)) { errorKind = 'empty'; errorMessage = `No ${kind} results for "${query}".`; }
        }
      } else if (tool === 'web') {
        const wm = args.match(/^\/!web\s+(\S+)/i);
        if (!wm) throw new Error('Malformed web arguments');
        const r = await withTimeout((signal) => fetch(wm[1], { redirect: 'follow', signal }));
        status = r.status; body = await r.text();
        if (!r.ok) { errorKind = 'http'; errorMessage = `Request returned HTTP ${r.status}.`; }
        else if (!body.trim()) { errorKind = 'empty'; errorMessage = 'Response body was empty.'; }
      } else if (tool === 'news') {
        const r = await withTimeout((signal) => fetch('https://digjxtmzafzcgytgcwmb.supabase.co/functions/v1/news-api/?limit=100', { redirect: 'follow', signal }));
        status = r.status; body = await r.text();
        if (!r.ok) { errorKind = 'http'; errorMessage = `News feed returned HTTP ${r.status}.`; }
        else if (isEmptyPayload(body)) { errorKind = 'empty'; errorMessage = 'News feed returned no items.'; }
      } else if (tool in CC_ACTIONS) {
        const action = CC_ACTIONS[tool];
        const r = await withTimeout((signal) => fetch(`${CC_DATA_API_BASE}?action=${action}&apikey=${CC_DATA_API_KEY}`, { signal }));
        status = r.status; body = await r.text();
        if (!r.ok) { errorKind = 'http'; errorMessage = `${tool} returned HTTP ${r.status}.`; }
        else if (isEmptyPayload(body)) { errorKind = 'empty'; errorMessage = `${tool} returned no items.`; }
      } else {
        return new Response(JSON.stringify({ error: 'Unknown tool' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const timeout = /abort/i.test(msg);
      errorKind = timeout ? 'timeout' : 'network';
      errorMessage = timeout ? `Timed out after ${TOOL_TIMEOUT_MS / 1000}s.` : `Network error: ${msg}`;
      body ||= msg;
    }

    return new Response(JSON.stringify({
      tool, args, status, body,
      result: status != null ? `[HTTP ${status}] ${body}` : body,
      durationMs: Date.now() - started,
      errorKind, errorMessage,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
