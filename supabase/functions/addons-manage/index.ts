// Manages the /addons marketplace: uploading .caiaddon packages (renamed
// .zip files containing addon.json, an optional tools.json, and
// tools/<file>.py scripts), listing them, and installing/uninstalling per
// user. Tool execution itself lives in `chat` (inline) and `run-tool`
// (retry), both via ../_shared/addonTools.ts.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import JSZip from 'https://esm.sh/jszip@3.10.1';
import { PREFIX_RE, TOOL_NAME_RE, type AddonToolDef, type AddonToolParam } from '../_shared/addonTools.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MAX_FILE_BYTES = 3 * 1024 * 1024; // 3 MB
const MAX_TOOLS = 25;
const MAX_SOURCE_BYTES = 200 * 1024; // 200 KB per script

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const bytesToB64 = (bytes: Uint8Array) => {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
};

function validateParams(raw: unknown): AddonToolParam[] {
  if (!Array.isArray(raw)) return [];
  const out: AddonToolParam[] = [];
  for (const p of raw) {
    if (!p || typeof p !== 'object' || typeof (p as any).name !== 'string') continue;
    out.push({
      name: String((p as any).name).slice(0, 60),
      type: typeof (p as any).type === 'string' ? (p as any).type.slice(0, 20) : undefined,
      required: (p as any).required === false ? false : true,
      description: typeof (p as any).description === 'string' ? (p as any).description.slice(0, 300) : undefined,
    });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get('Authorization');
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: authHeader ? { Authorization: authHeader } : {} },
    });
    const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');

    // ---- list: public, no auth required ---------------------------------
    if (action === 'list') {
      const { data: addons, error } = await admin
        .from('addons')
        .select('id, name, prefix, version, description, author_name, tools, dependencies, install_count, created_at, updated_at')
        .order('created_at', { ascending: false });
      if (error) return json({ error: error.message }, 500);

      let installedIds: string[] = [];
      if (authHeader) {
        const { data: { user } } = await anonClient.auth.getUser();
        if (user) {
          const { data: rows } = await admin.from('user_addons').select('addon_id').eq('user_id', user.id);
          installedIds = (rows ?? []).map((r: any) => r.addon_id);
        }
      }
      return json({ addons: addons ?? [], installedIds });
    }

    // Every other action requires auth.
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);
    const { data: { user } } = await anonClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    if (action === 'install' || action === 'uninstall') {
      const addonId = String(body.addonId || '');
      if (!addonId) return json({ error: 'addonId required' }, 400);
      if (action === 'install') {
        const { error } = await admin.from('user_addons').upsert([{ user_id: user.id, addon_id: addonId }]);
        if (error) return json({ error: error.message }, 500);
        const { data: cur } = await admin.from('addons').select('install_count').eq('id', addonId).maybeSingle();
        await admin.from('addons').update({ install_count: (cur?.install_count ?? 0) + 1 }).eq('id', addonId);
      } else {
        const { error } = await admin.from('user_addons').delete().eq('user_id', user.id).eq('addon_id', addonId);
        if (error) return json({ error: error.message }, 500);
      }
      return json({ ok: true });
    }

    if (action === 'delete') {
      const addonId = String(body.addonId || '');
      if (!addonId) return json({ error: 'addonId required' }, 400);
      const { data: addon } = await admin.from('addons').select('author_id').eq('id', addonId).maybeSingle();
      if (!addon) return json({ error: 'Addon not found' }, 404);
      const { data: isAdminRow } = await admin.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin').maybeSingle();
      if (addon.author_id !== user.id && !isAdminRow) return json({ error: 'Not allowed to delete this addon' }, 403);
      const { error } = await admin.from('addons').delete().eq('id', addonId);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    if (action === 'upload') {
      const fileBase64 = String(body.fileBase64 || '');
      if (!fileBase64) return json({ error: 'fileBase64 required' }, 400);

      let bytes: Uint8Array;
      try { bytes = b64ToBytes(fileBase64); } catch { return json({ error: 'Invalid base64 payload' }, 400); }
      if (bytes.length === 0) return json({ error: 'Empty file' }, 400);
      if (bytes.length > MAX_FILE_BYTES) return json({ error: `.caiaddon is too large (max ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB)` }, 400);

      let zip: JSZip;
      try { zip = await JSZip.loadAsync(bytes); } catch { return json({ error: 'Not a valid .caiaddon (zip) file' }, 400); }

      const findEntry = (name: string) => zip.file(new RegExp(`(^|/)${name.replace('.', '\\.')}$`))[0] ?? zip.file(name);

      const addonJsonEntry = findEntry('addon.json');
      if (!addonJsonEntry) return json({ error: 'addon.json is required but was not found in the package' }, 400);

      let addonJson: any;
      try { addonJson = JSON.parse(await addonJsonEntry.async('string')); } catch (e) {
        return json({ error: `addon.json is not valid JSON: ${e instanceof Error ? e.message : String(e)}` }, 400);
      }

      const id = typeof addonJson.id === 'string' ? addonJson.id.trim() : '';
      const name = typeof addonJson.name === 'string' ? addonJson.name.trim() : '';
      const prefix = typeof addonJson.prefix === 'string' ? addonJson.prefix.trim().toLowerCase() : '';
      if (!id || id.length > 200) return json({ error: 'addon.json: "id" is required (non-empty string, max 200 chars)' }, 400);
      if (!name || name.length > 120) return json({ error: 'addon.json: "name" is required (non-empty string, max 120 chars)' }, 400);
      if (!PREFIX_RE.test(prefix)) return json({ error: 'addon.json: "prefix" must be lowercase letters/numbers/underscore, starting with a letter (2-24 chars)' }, 400);

      const version = typeof addonJson.version === 'string' ? addonJson.version.slice(0, 40) : null;
      const description = typeof addonJson.description === 'string' ? addonJson.description.slice(0, 1000) : null;
      const dependencies = Array.isArray(addonJson.dependencies) ? addonJson.dependencies.filter((d: any) => d && typeof d.id === 'string').slice(0, 20) : [];

      // Ownership / prefix-collision checks.
      const { data: existingById } = await admin.from('addons').select('id, author_id').eq('id', id).maybeSingle();
      if (existingById && existingById.author_id && existingById.author_id !== user.id) {
        return json({ error: `An addon with id "${id}" already exists and is owned by someone else. Choose a different id.` }, 409);
      }
      const { data: existingByPrefix } = await admin.from('addons').select('id').eq('prefix', prefix).neq('id', id).maybeSingle();
      if (existingByPrefix) {
        return json({ error: `Prefix "${prefix}" is already taken by another addon. Choose a different prefix.` }, 409);
      }

      // tools.json is optional; default to no tools.
      const toolsJsonEntry = findEntry('tools.json');
      let rawTools: any[] = [];
      if (toolsJsonEntry) {
        let parsed: any;
        try { parsed = JSON.parse(await toolsJsonEntry.async('string')); } catch (e) {
          return json({ error: `tools.json is not valid JSON: ${e instanceof Error ? e.message : String(e)}` }, 400);
        }
        rawTools = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.tools) ? parsed.tools : [];
      }
      if (rawTools.length > MAX_TOOLS) return json({ error: `Too many tools (max ${MAX_TOOLS})` }, 400);

      const tools: AddonToolDef[] = [];
      const toolSources: { tool_name: string; file: string; source: string; description: string | null; parameters: AddonToolParam[] }[] = [];
      const seenNames = new Set<string>();

      for (const raw of rawTools) {
        const toolName = typeof raw?.name === 'string' ? raw.name.trim().toLowerCase() : '';
        const file = typeof raw?.file === 'string' ? raw.file.trim() : '';
        if (!toolName || !TOOL_NAME_RE.test(toolName)) return json({ error: `tools.json: invalid tool name "${raw?.name}" (lowercase letters/numbers/-/_ only)` }, 400);
        if (seenNames.has(toolName)) return json({ error: `tools.json: duplicate tool name "${toolName}"` }, 400);
        seenNames.add(toolName);
        if (!file) return json({ error: `tools.json: tool "${toolName}" is missing "file"` }, 400);

        const scriptEntry = findEntry(`tools/${file}`) ?? findEntry(file);
        if (!scriptEntry) return json({ error: `tools.json: script "tools/${file}" for tool "${toolName}" was not found in the package` }, 400);
        const source = await scriptEntry.async('string');
        if (new TextEncoder().encode(source).length > MAX_SOURCE_BYTES) {
          return json({ error: `tools/${file} is too large (max ${Math.round(MAX_SOURCE_BYTES / 1024)} KB)` }, 400);
        }

        const description = typeof raw?.description === 'string' ? raw.description.slice(0, 300) : null;
        const parameters = validateParams(raw?.parameters);

        tools.push({ name: toolName, file, description: description ?? undefined, parameters });
        toolSources.push({ tool_name: toolName, file, source, description, parameters });
      }

      const authorName = (user.email as string | undefined) ?? user.id;
      const now = new Date().toISOString();

      const { error: upsertErr } = await admin.from('addons').upsert([{
        id,
        name,
        prefix,
        version,
        description,
        author_id: user.id,
        author_name: authorName,
        addon_json: addonJson,
        tools,
        dependencies,
        file_base64: fileBase64,
        file_size: bytes.length,
        updated_at: now,
      }]);
      if (upsertErr) return json({ error: `Failed to save addon: ${upsertErr.message}` }, 500);

      await admin.from('addon_tool_sources').delete().eq('addon_id', id);
      if (toolSources.length) {
        const { error: srcErr } = await admin.from('addon_tool_sources').insert(
          toolSources.map((t) => ({ addon_id: id, tool_name: t.tool_name, file: t.file, source: t.source, description: t.description, parameters: t.parameters })),
        );
        if (srcErr) return json({ error: `Failed to save addon tool sources: ${srcErr.message}` }, 500);
      }

      // Auto-install for the uploader so it's immediately usable.
      await admin.from('user_addons').upsert([{ user_id: user.id, addon_id: id }]);

      return json({ ok: true, addon: { id, name, prefix, version, description, tools } });
    }

    return json({ error: `Unknown action "${action}"` }, 400);
  } catch (e) {
    console.error('addons-manage error:', e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
