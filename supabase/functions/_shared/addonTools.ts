// Runtime for user-uploaded .caiaddon packages. An addon registers one or
// more tools that the AI can call as `/!<prefix>:<toolname> <args>`. Each
// tool is a Python script (tools/<file>.py) whose source is stored in
// public.addon_tool_sources and executed inside the same Pyodide sandbox
// used by the /!terminal tool — no host filesystem, no host processes.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { runPythonSandbox } from './pythonRuntime.ts';

export interface AddonToolParam {
  name: string;
  type?: string;
  required?: boolean;
  description?: string;
}

export interface AddonToolDef {
  name: string;
  file: string;
  description?: string;
  parameters?: AddonToolParam[];
}

export interface AddonRecord {
  id: string;
  name: string;
  prefix: string;
  description?: string | null;
  tools: AddonToolDef[];
}

export type AddonToolResult = {
  status: number | null;
  body: string;
  errorKind?: 'timeout' | 'network' | 'http' | 'empty' | 'config' | 'unknown';
  errorMessage?: string;
};

const ADDON_TOOL_TIMEOUT_MS = 15000;

/** Reverse-dns-ish id, lowercase prefix, tool names: kept intentionally permissive but safe for regex use. */
export const PREFIX_RE = /^[a-z][a-z0-9_]{1,23}$/;
export const TOOL_NAME_RE = /^[a-z][a-z0-9_-]{0,39}$/i;

export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Splits a raw argument string into tokens, honoring "quoted strings" and 'single quotes'. */
export function splitArgs(argsStr: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(argsStr.trim()))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

/** Loads the addons a given user has installed (id, name, prefix, tools only — no source). */
export async function loadInstalledAddons(supabase: SupabaseClient, userId: string): Promise<AddonRecord[]> {
  const { data: rows } = await supabase.from('user_addons').select('addon_id').eq('user_id', userId);
  const ids = (rows ?? []).map((r: any) => r.addon_id as string);
  if (!ids.length) return [];
  const { data: addons } = await supabase
    .from('addons')
    .select('id, name, prefix, description, tools')
    .in('id', ids);
  return (addons ?? []) as AddonRecord[];
}

/** Builds the system-prompt lines describing each installed addon's tools. */
export function buildAddonToolLines(addons: AddonRecord[]): string[] {
  const lines: string[] = [];
  for (const addon of addons) {
    for (const tool of addon.tools ?? []) {
      const params = (tool.parameters ?? []).map((p) => `<${p.name}${p.required === false ? '?' : ''}>`).join(' ');
      const desc = tool.description ? ` — ${tool.description}` : '';
      lines.push(`- /!${addon.prefix}:${tool.name}${params ? ' ' + params : ''}                (from addon "${addon.name}")${desc}`);
    }
  }
  return lines;
}

/** Builds a combined regex matching any installed addon's /!prefix:tool invocation lines. */
export function buildAddonRegex(addons: AddonRecord[]): RegExp | null {
  const prefixes = [...new Set(addons.map((a) => a.prefix))];
  if (!prefixes.length) return null;
  return new RegExp(`^\\s*\\/!(?:${prefixes.map(escapeRegex).join('|')}):[\\w-]+\\b.*$`, 'gim');
}

/** Executes a single addon tool invocation and returns a ToolResult-shaped object. */
export async function runAddonTool(
  supabase: SupabaseClient,
  opts: { prefix: string; toolName: string; argsStr: string; addons: AddonRecord[] },
): Promise<AddonToolResult> {
  const { prefix, toolName, argsStr, addons } = opts;
  const addon = addons.find((a) => a.prefix.toLowerCase() === prefix.toLowerCase());
  if (!addon) {
    return { status: null, body: `Addon with prefix "${prefix}" is not installed.`, errorKind: 'config', errorMessage: 'Addon not installed. Visit /addons to install it first.' };
  }
  const toolDef = (addon.tools ?? []).find((t) => t.name.toLowerCase() === toolName.toLowerCase());
  if (!toolDef) {
    return { status: null, body: `Tool "${toolName}" was not found in addon "${addon.name}".`, errorKind: 'unknown', errorMessage: 'Unknown addon tool.' };
  }

  const { data: srcRow, error: srcErr } = await supabase
    .from('addon_tool_sources')
    .select('source')
    .eq('addon_id', addon.id)
    .eq('tool_name', toolDef.name)
    .maybeSingle();
  if (srcErr || !srcRow?.source) {
    return { status: null, body: 'Tool source is missing.', errorKind: 'config', errorMessage: 'This addon tool has no stored source (it may need to be re-uploaded).' };
  }

  const args = splitArgs(argsStr);
  const wrapped = `import sys\nsys.argv = ${JSON.stringify([toolDef.file, ...args])}\n` + srcRow.source;

  try {
    const result = await runPythonSandbox({ source: wrapped, scriptName: toolDef.file, cwd: '/', files: [], timeoutMs: ADDON_TOOL_TIMEOUT_MS });
    const out = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    if (result.stderr) {
      const timedOut = /execution timed out/i.test(result.stderr);
      return {
        status: 200,
        body: out || result.stderr,
        errorKind: timedOut ? 'timeout' : 'unknown',
        errorMessage: result.stderr.trim().split('\n').pop() || 'Script raised an error.',
      };
    }
    return { status: 200, body: out || '(no output)' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { status: null, body: msg, errorKind: 'unknown', errorMessage: `Addon tool error: ${msg}` };
  }
}
