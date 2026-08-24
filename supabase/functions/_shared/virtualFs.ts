// Simulated Linux-style terminal backed by the public.chat_files table.
// One persistent virtual filesystem per conversation. Shared by the
// `chat` and `run-tool` edge functions.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import JSZip from 'npm:jszip@3.10.1';

export const TERMINAL_MAX_ENTRIES = 40;          // files + dirs per conversation
export const TERMINAL_MAX_FILE_BYTES = 256 * 1024; // 256 KB per file
const MAX_OUTPUT_CHARS = 8000;

interface FsNode {
  path: string;
  contentBase64: string;
  isBinary: boolean;
  isDir: boolean;
}

export interface TerminalResult {
  stdout: string;
  stderr: string;
  cwd: string;
}

// ---------- base64 helpers (Deno has no Buffer) ----------
const te = new TextEncoder();
const td = new TextDecoder();
export const bytesToB64 = (bytes: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
};
export const b64ToBytes = (b64: string): Uint8Array => {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
};
export const textToB64 = (s: string): string => bytesToB64(te.encode(s));
export const b64ToText = (b64: string): string => td.decode(b64ToBytes(b64));

// ---------- path handling ----------
// Resolve `p` against `cwd`. Absolute within the sandbox root; `..` is
// clamped at `/` so escaping the sandbox is impossible.
export const resolvePath = (cwd: string, p: string): string => {
  const raw = p.startsWith('/') ? p : `${cwd.replace(/\/+$/, '')}/${p}`;
  const out: string[] = [];
  for (const seg of raw.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') { out.pop(); continue; }
    out.push(seg);
  }
  return '/' + out.join('/');
};

const parentOf = (p: string): string => {
  const i = p.lastIndexOf('/');
  return i <= 0 ? '/' : p.slice(0, i);
};
const baseName = (p: string): string => p.slice(p.lastIndexOf('/') + 1);

// ---------- shell tokenizer (quotes + > >> redirection) ----------
const tokenize = (input: string): string[] => {
  const tokens: string[] = [];
  let cur = '';
  let quote: string | null = null;
  let started = false;
  const push = () => { if (started || cur) { tokens.push(cur); cur = ''; started = false; } };
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quote) {
      if (c === quote) quote = null;
      else cur += c;
      continue;
    }
    if (c === '"' || c === "'") { quote = c; started = true; continue; }
    if (/\s/.test(c)) { push(); continue; }
    if (c === '>') {
      push();
      if (input[i + 1] === '>') { tokens.push('>>'); i++; } else tokens.push('>');
      continue;
    }
    cur += c;
  }
  push();
  return tokens;
};

const HELP_TEXT = `Crossi AI sandbox terminal — supported commands:
  pwd                          print working directory
  cd <dir>                     change directory
  ls [dir]                     list files (dirs end with /)
  cat <file...>                print file contents
  echo [-n] <text> [> file | >> file]   write text
  printf <text> [> file | >> file]      write text (no trailing newline)
  touch <file>                 create empty file
  mkdir [-p] <dir>             create directory
  rm [-r] <path...>            remove files (dirs need -r)
  mv <src> <dst>               move/rename
  cp [-r] <src> <dst>          copy (dirs need -r)
  head [-n N] <file>           first N lines (default 10)
  tail [-n N] <file>           last N lines (default 10)
  wc <file...>                 line/word/byte counts
  grep <pattern> <file...>     lines matching a substring
  zip <out.zip> <path...>      create a zip archive
  unzip -l <zip>               list a zip archive
  base64 [-d] <file>           encode / decode a text file
  python <script.py>           run a Python script from the filesystem
  python -c "code"             run inline Python (single line; write a .py file for multi-line)
                               subset: print, vars, math, strings, lists, if/for/while,
                               f-strings, open() reads/writes this filesystem
  help                         this help
Limits: ${TERMINAL_MAX_ENTRIES} entries, ${Math.round(TERMINAL_MAX_FILE_BYTES / 1024)} KB per file. Files persist for this conversation.`;

// ---------- main entry ----------
export async function runTerminal(
  client: SupabaseClient,
  opts: { conversationId: string; userId: string; command: string },
): Promise<TerminalResult> {
  const { conversationId, userId, command } = opts;

  // Load cwd
  const { data: convo } = await client
    .from('conversations')
    .select('terminal_cwd')
    .eq('id', conversationId)
    .maybeSingle();
  let cwd = (convo as any)?.terminal_cwd || '/';

  // Load filesystem
  const { data: rows, error: loadErr } = await client
    .from('chat_files')
    .select('path, content_base64, is_binary, is_dir')
    .eq('conversation_id', conversationId);
  if (loadErr) return { stdout: '', stderr: `terminal: failed to load filesystem: ${loadErr.message}`, cwd };

  const fs = new Map<string, FsNode>();
  for (const r of rows ?? []) {
    fs.set((r as any).path, {
      path: (r as any).path,
      contentBase64: (r as any).content_base64 ?? '',
      isBinary: !!(r as any).is_binary,
      isDir: !!(r as any).is_dir,
    });
  }
  const originalPaths = new Set(fs.keys());

  const dirExists = (p: string): boolean => {
    if (p === '/') return true;
    if (fs.get(p)?.isDir) return true;
    const prefix = p + '/';
    for (const key of fs.keys()) if (key.startsWith(prefix)) return true;
    return false;
  };
  const fileCount = () => {
    let n = 0;
    for (const node of fs.values()) if (!node.isDir) n++;
    return n;
  };

  const out: string[] = [];
  const err: string[] = [];
  const fail = (cmd: string, msg: string) => err.push(`${cmd}: ${msg}`);

  const writeFile = (abs: string, text: string, append: boolean): string | null => {
    const parent = parentOf(abs);
    if (!dirExists(parent)) return `cannot create '${abs}': No such file or directory`;
    const existing = fs.get(abs);
    if (existing?.isDir) return `cannot write '${abs}': Is a directory`;
    const prev = existing && append ? b64ToText(existing.contentBase64) : '';
    const next = prev + text;
    const size = te.encode(next).length;
    if (size > TERMINAL_MAX_FILE_BYTES) return `write failed '${abs}': File too large (max ${Math.round(TERMINAL_MAX_FILE_BYTES / 1024)} KB)`;
    if (!existing && fileCount() >= TERMINAL_MAX_ENTRIES) return `cannot create '${abs}': Filesystem entry limit reached (${TERMINAL_MAX_ENTRIES})`;
    fs.set(abs, { path: abs, contentBase64: textToB64(next), isBinary: false, isDir: false });
    return null;
  };

  const removeRecursive = (abs: string): number => {
    let removed = 0;
    if (fs.delete(abs)) removed++;
    const prefix = abs + '/';
    for (const key of [...fs.keys()]) {
      if (key.startsWith(prefix)) { fs.delete(key); removed++; }
    }
    return removed;
  };

  const copyRecursive = (src: string, dst: string): string | null => {
    const node = fs.get(src);
    if (!node && !dirExists(src)) return `cannot copy '${src}': No such file or directory`;
    if (node && !node.isDir) {
      const target = dirExists(dst) && !fs.get(dst)?.isDir && dst !== node.path ? resolvePath(dst, baseName(src)) : dst;
      const realTarget = fs.get(dst)?.isDir || (dirExists(dst) && !fs.has(dst)) || dst.endsWith('/') ? resolvePath(dst, baseName(src)) : dst;
      void target;
      if (fileCount() >= TERMINAL_MAX_ENTRIES && !fs.has(realTarget)) return `cannot copy: entry limit reached (${TERMINAL_MAX_ENTRIES})`;
      fs.set(realTarget, { ...node, path: realTarget });
      return null;
    }
    // directory copy
    const prefix = src + '/';
    const entries = [...fs.values()].filter((n) => n.path === src || n.path.startsWith(prefix));
    if (!fs.get(src)?.isDir) {
      fs.set(dst, { path: dst, contentBase64: '', isBinary: false, isDir: true });
    }
    for (const n of entries) {
      if (n.path === src) continue;
      const rel = n.path.slice(prefix.length);
      const target = resolvePath(dst, rel);
      if (!fs.has(target) && fileCount() >= TERMINAL_MAX_ENTRIES) return `cannot copy: entry limit reached (${TERMINAL_MAX_ENTRIES})`;
      fs.set(target, { ...n, path: target });
    }
    return null;
  };

  // ---- parse & execute ----
  const tokens = tokenize(command.trim());
  const cmd = (tokens[0] || '').toLowerCase();

  // Split off redirection (only one supported per command)
  let redirect: { op: '>' | '>>'; file: string } | null = null;
  let args = tokens.slice(1);
  const redirIdx = args.findIndex((t) => t === '>' || t === '>>');
  if (redirIdx !== -1) {
    const op = args[redirIdx] as '>' | '>>';
    const file = args[redirIdx + 1];
    if (!file) {
      err.push(`${cmd || 'terminal'}: syntax error near '>'`);
    } else {
      redirect = { op, file: resolvePath(cwd, file) };
      args = [...args.slice(0, redirIdx), ...args.slice(redirIdx + 2)];
    }
  }

  try {
    if (!cmd) {
      // nothing
    } else if (cmd === 'help' || cmd === '--help') {
      out.push(HELP_TEXT);
    } else if (cmd === 'pwd') {
      out.push(cwd);
    } else if (cmd === 'cd') {
      const target = args.length ? resolvePath(cwd, args[0]) : '/';
      if (!dirExists(target)) fail('cd', `'${args[0] ?? target}': No such directory`);
      else cwd = target;
    } else if (cmd === 'ls') {
      const dir = args.length && !args[0].startsWith('-') ? resolvePath(cwd, args[0]) : cwd;
      if (!dirExists(dir)) fail('ls', `cannot access '${args[0] ?? dir}': No such directory`);
      else {
        const prefix = dir === '/' ? '/' : dir + '/';
        const children = new Map<string, boolean>(); // name -> isDir
        for (const n of fs.values()) {
          if (!n.path.startsWith(prefix) || n.path === dir) continue;
          const rest = n.path.slice(prefix.length);
          const head = rest.split('/')[0];
          children.set(head, rest.includes('/') || n.isDir);
        }
        if (children.size === 0) out.push('(empty)');
        else {
          out.push([...children.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([name, isDir]) => (isDir ? name + '/' : name))
            .join('  '));
        }
      }
    } else if (cmd === 'cat') {
      const files = args.filter((a) => !a.startsWith('-'));
      if (!files.length) fail('cat', 'missing file operand');
      let text = '';
      for (const f of files) {
        const abs = resolvePath(cwd, f);
        const node = fs.get(abs);
        if (!node) { fail('cat', `'${f}': No such file`); continue; }
        if (node.isDir) { fail('cat', `'${f}': Is a directory`); continue; }
        if (node.isBinary) { fail('cat', `'${f}': Binary file (use base64 or download it)`); continue; }
        text += b64ToText(node.contentBase64);
      }
      if (redirect && err.length === 0) {
        const e = writeFile(redirect.file, text, redirect.op === '>>');
        if (e) fail('cat', e);
      } else if (text) out.push(text.replace(/\n$/, ''));
    } else if (cmd === 'echo' || cmd === 'printf') {
      let parts = [...args];
      let newline = cmd === 'echo';
      if (cmd === 'echo' && parts[0] === '-n') { newline = false; parts = parts.slice(1); }
      const text = parts.join(' ') + (newline ? '\n' : '');
      if (redirect) {
        const e = writeFile(redirect.file, text, redirect.op === '>>');
        if (e) fail(cmd, e);
      } else {
        out.push(parts.join(' '));
      }
    } else if (cmd === 'touch') {
      const files = args.filter((a) => !a.startsWith('-'));
      if (!files.length) fail('touch', 'missing file operand');
      for (const f of files) {
        const abs = resolvePath(cwd, f);
        if (!fs.has(abs)) {
          const e = writeFile(abs, '', false);
          if (e) fail('touch', e);
        }
      }
    } else if (cmd === 'mkdir') {
      const parents = args.includes('-p');
      const dirs = args.filter((a) => a !== '-p');
      if (!dirs.length) fail('mkdir', 'missing operand');
      for (const d of dirs) {
        const abs = resolvePath(cwd, d);
        if (dirExists(abs) || fs.has(abs)) { fail('mkdir', `cannot create directory '${d}': File exists`); continue; }
        if (!parents && !dirExists(parentOf(abs))) { fail('mkdir', `cannot create directory '${d}': No such file or directory`); continue; }
        if (fs.size >= TERMINAL_MAX_ENTRIES) { fail('mkdir', `entry limit reached (${TERMINAL_MAX_ENTRIES})`); continue; }
        if (parents) {
          // create missing intermediate dirs
          const segs = abs.split('/').filter(Boolean);
          let cur = '';
          for (const s of segs) {
            cur += '/' + s;
            if (!fs.has(cur) && fs.size < TERMINAL_MAX_ENTRIES) {
              fs.set(cur, { path: cur, contentBase64: '', isBinary: false, isDir: true });
            }
          }
        } else {
          fs.set(abs, { path: abs, contentBase64: '', isBinary: false, isDir: true });
        }
      }
    } else if (cmd === 'rm') {
      const recursive = args.includes('-r') || args.includes('-rf') || args.includes('-fr');
      const paths = args.filter((a) => !a.startsWith('-'));
      if (!paths.length) fail('rm', 'missing operand');
      for (const p of paths) {
        const abs = resolvePath(cwd, p);
        const node = fs.get(abs);
        if (!node && !dirExists(abs)) { fail('rm', `cannot remove '${p}': No such file or directory`); continue; }
        const isDir = node?.isDir || (!node && dirExists(abs));
        if (isDir && !recursive) { fail('rm', `cannot remove '${p}': Is a directory (use -r)`); continue; }
        if (abs === '/') { fail('rm', `cannot remove '/'`); continue; }
        removeRecursive(abs);
      }
    } else if (cmd === 'mv' || cmd === 'cp') {
      const recursive = args.includes('-r') || args.includes('-rf') || args.includes('-fr');
      const paths = args.filter((a) => !a.startsWith('-'));
      if (paths.length !== 2) { fail(cmd, 'usage: ' + cmd + ' [-r] <src> <dst>'); }
      else {
        const src = resolvePath(cwd, paths[0]);
        let dst = resolvePath(cwd, paths[1]);
        const srcNode = fs.get(src);
        if (!srcNode && !dirExists(src)) fail(cmd, `cannot stat '${paths[0]}': No such file or directory`);
        else {
          const srcIsDir = srcNode?.isDir || (!srcNode && dirExists(src));
          if (srcIsDir && !recursive && cmd === 'cp') fail('cp', `-r not specified; omitting directory '${paths[0]}'`);
          else {
            if (dirExists(dst)) dst = resolvePath(dst, baseName(src));
            const e = copyRecursive(src, dst);
            if (e) fail(cmd, e);
            else if (cmd === 'mv') removeRecursive(src);
          }
        }
      }
    } else if (cmd === 'head' || cmd === 'tail') {
      let n = 10;
      let rest = [...args];
      const nIdx = rest.indexOf('-n');
      if (nIdx !== -1 && rest[nIdx + 1]) { n = Math.max(1, parseInt(rest[nIdx + 1], 10) || 10); rest = rest.filter((_, i) => i !== nIdx && i !== nIdx + 1); }
      const files = rest.filter((a) => !a.startsWith('-'));
      if (!files.length) fail(cmd, 'missing file operand');
      for (const f of files) {
        const abs = resolvePath(cwd, f);
        const node = fs.get(abs);
        if (!node || node.isDir) { fail(cmd, `'${f}': No such file`); continue; }
        if (node.isBinary) { fail(cmd, `'${f}': Binary file`); continue; }
        const lines = b64ToText(node.contentBase64).split('\n');
        out.push(cmd === 'head' ? lines.slice(0, n).join('\n') : lines.slice(-n).join('\n'));
      }
    } else if (cmd === 'wc') {
      const files = args.filter((a) => !a.startsWith('-'));
      if (!files.length) fail('wc', 'missing file operand');
      let tL = 0, tW = 0, tB = 0;
      for (const f of files) {
        const abs = resolvePath(cwd, f);
        const node = fs.get(abs);
        if (!node || node.isDir) { fail('wc', `'${f}': No such file`); continue; }
        const bytes = b64ToBytes(node.contentBase64);
        const text = node.isBinary ? '' : td.decode(bytes);
        const lines = node.isBinary ? 0 : (text ? text.split('\n').length : 0);
        const words = node.isBinary ? 0 : (text.trim() ? text.trim().split(/\s+/).length : 0);
        tL += lines; tW += words; tB += bytes.length;
        out.push(`${lines} ${words} ${bytes.length} ${f}`);
      }
      if (files.length > 1) out.push(`${tL} ${tW} ${tB} total`);
    } else if (cmd === 'grep') {
      const [pattern, ...files] = args;
      if (!pattern || !files.length) fail('grep', 'usage: grep <pattern> <file...>');
      else {
        for (const f of files) {
          const abs = resolvePath(cwd, f);
          const node = fs.get(abs);
          if (!node || node.isDir || node.isBinary) { fail('grep', `'${f}': No such file`); continue; }
          const matches = b64ToText(node.contentBase64).split('\n').filter((l) => l.includes(pattern));
          out.push(files.length > 1 ? matches.map((m) => `${f}:${m}`).join('\n') : matches.join('\n'));
        }
      }
    } else if (cmd === 'zip') {
      const [zipName, ...paths] = args.filter((a) => !a.startsWith('-'));
      if (!zipName || !paths.length) fail('zip', 'usage: zip <out.zip> <path...>');
      else {
        const zip = new JSZip();
        let added = 0;
        for (const p of paths) {
          const abs = resolvePath(cwd, p);
          const node = fs.get(abs);
          if (node && !node.isDir) {
            zip.file(baseName(abs), b64ToBytes(node.contentBase64));
            added++;
          } else if (dirExists(abs)) {
            const prefix = abs + '/';
            for (const n of fs.values()) {
              if (n.isDir || !n.path.startsWith(prefix)) continue;
              zip.file(baseName(abs) + '/' + n.path.slice(prefix.length), b64ToBytes(n.contentBase64));
              added++;
            }
          } else {
            fail('zip', `name not matched: ${p}`);
          }
        }
        if (added > 0) {
          const bytes: Uint8Array = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
          if (bytes.length > TERMINAL_MAX_FILE_BYTES) fail('zip', `archive too large (max ${Math.round(TERMINAL_MAX_FILE_BYTES / 1024)} KB)`);
          else {
            const abs = resolvePath(cwd, zipName);
            const parent = parentOf(abs);
            if (!dirExists(parent)) fail('zip', `cannot create '${zipName}': No such directory`);
            else if (!fs.has(abs) && fileCount() >= TERMINAL_MAX_ENTRIES) fail('zip', `entry limit reached (${TERMINAL_MAX_ENTRIES})`);
            else {
              fs.set(abs, { path: abs, contentBase64: bytesToB64(bytes), isBinary: true, isDir: false });
              out.push(`adding: ${added} file(s) → ${zipName} (${bytes.length} bytes)`);
            }
          }
        }
      }
    } else if (cmd === 'unzip') {
      const paths = args.filter((a) => !a.startsWith('-'));
      const listOnly = args.includes('-l');
      if (!paths.length) fail('unzip', 'usage: unzip -l <zip> (listing only)');
      else if (!listOnly) fail('unzip', 'only listing is supported: unzip -l <zip>');
      else {
        const abs = resolvePath(cwd, paths[0]);
        const node = fs.get(abs);
        if (!node || node.isDir) fail('unzip', `'${paths[0]}': No such file`);
        else {
          try {
            const zip = await JSZip.loadAsync(b64ToBytes(node.contentBase64));
            const lines: string[] = [`Archive:  ${paths[0]}`];
            let total = 0;
            zip.forEach((rel, entry) => {
              if (entry.dir) return;
              // JSZip doesn't expose uncompressed size pre-read; read it.
              lines.push(`  ${rel}`);
            });
            const names = lines.slice(1);
            for (const name of names) {
              const data = await zip.file(name.trim())?.async('uint8array');
              total += data?.length ?? 0;
            }
            out.push([`Archive:  ${paths[0]}`, ...names.map((n) => `  ${n}`), `${names.length} file(s), ~${total} bytes uncompressed`].join('\n'));
          } catch {
            fail('unzip', `'${paths[0]}': not a valid zip archive`);
          }
        }
      }
    } else if (cmd === 'base64') {
      const decode = args.includes('-d');
      const files = args.filter((a) => !a.startsWith('-'));
      if (!files.length) fail('base64', 'missing file operand');
      for (const f of files) {
        const abs = resolvePath(cwd, f);
        const node = fs.get(abs);
        if (!node || node.isDir) { fail('base64', `'${f}': No such file`); continue; }
        if (decode) {
          if (node.isBinary) { fail('base64', `'${f}': already binary`); continue; }
          out.push(b64ToText(node.contentBase64));
        } else {
          if (node.isBinary) { fail('base64', `'${f}': already binary`); continue; }
          out.push(node.contentBase64);
        }
      }
    } else if (cmd === 'python' || cmd === 'python3') {
      let src: string | null = null;
      let scriptName = '<string>';
      if (args[0] === '-c') {
        src = args.slice(1).join(' ');
        if (!src.trim()) { fail('python', 'usage: python -c "code"'); src = null; }
      } else if (args[0] && !args[0].startsWith('-')) {
        const abs = resolvePath(cwd, args[0]);
        const pnode = fs.get(abs);
        if (!pnode || pnode.isDir) fail('python', `can't open file '${args[0]}': [Errno 2] No such file or directory`);
        else if (pnode.isBinary) fail('python', `'${args[0]}': cannot execute binary file`);
        else { src = b64ToText(pnode.contentBase64); scriptName = args[0]; }
      } else {
        fail('python', `usage: python <script.py> | python -c "code"`);
      }
      if (src !== null) {
        const py = runPython(src, {
          cwd,
          scriptName,
          readText: (p) => {
            const n = fs.get(p);
            if (!n || n.isDir || n.isBinary) return null;
            return b64ToText(n.contentBase64);
          },
          writeText: (p, text, append) => writeFile(p, text, append),
        });
        if (py.stderr) err.push(py.stderr);
        if (redirect && py.stdout) {
          const wErr = writeFile(redirect.file, py.stdout, redirect.op === '>>');
          if (wErr) fail('python', wErr);
        } else if (py.stdout) {
          out.push(py.stdout.replace(/\n$/, ''));
        }
      }
    } else {
      err.push(`${cmd}: command not found (run 'help' for supported commands)`);
    }
  } catch (e) {
    err.push(`terminal: ${e instanceof Error ? e.message : String(e)}`);
  }

  // ---- persist changes ----
  try {
    const removed = [...originalPaths].filter((p) => !fs.has(p));
    if (removed.length) {
      await client.from('chat_files').delete().eq('conversation_id', conversationId).in('path', removed);
    }
    const upserts = [...fs.values()].map((n) => ({
      conversation_id: conversationId,
      user_id: userId,
      path: n.path,
      content_base64: n.contentBase64,
      is_binary: n.isBinary,
      is_dir: n.isDir,
      size_bytes: n.isDir ? 0 : b64ToBytes(n.contentBase64).length,
      updated_at: new Date().toISOString(),
    }));
    if (upserts.length) {
      const { error: upErr } = await client.from('chat_files').upsert(upserts, { onConflict: 'conversation_id,path' });
      if (upErr) err.push(`terminal: failed to save filesystem: ${upErr.message}`);
    }
    if (cwd !== ((convo as any)?.terminal_cwd || '/')) {
      await client.from('conversations').update({ terminal_cwd: cwd }).eq('id', conversationId);
    }
  } catch (e) {
    err.push(`terminal: persistence error: ${e instanceof Error ? e.message : String(e)}`);
  }

  let stdout = out.filter(Boolean).join('\n');
  if (stdout.length > MAX_OUTPUT_CHARS) {
    stdout = stdout.slice(0, MAX_OUTPUT_CHARS) + `\n… (output truncated at ${MAX_OUTPUT_CHARS} chars)`;
  }
  return { stdout, stderr: err.join('\n'), cwd };
};

// Read a single file from a conversation's virtual filesystem.
export async function readFsFile(
  client: SupabaseClient,
  opts: { conversationId: string; path: string; cwd?: string },
): Promise<{ name: string; contentBase64: string; isBinary: boolean; sizeBytes: number } | null> {
  const { conversationId, path } = opts;
  let cwd = opts.cwd;
  if (!cwd) {
    const { data: convo } = await client
      .from('conversations')
      .select('terminal_cwd')
      .eq('id', conversationId)
      .maybeSingle();
    cwd = (convo as any)?.terminal_cwd || '/';
  }
  const abs = resolvePath(cwd, path);
  const { data } = await client
    .from('chat_files')
    .select('path, content_base64, is_binary, is_dir, size_bytes')
    .eq('conversation_id', conversationId)
    .eq('path', abs)
    .maybeSingle();
  if (!data || (data as any).is_dir) return null;
  return {
    name: baseName((data as any).path),
    contentBase64: (data as any).content_base64 ?? '',
    isBinary: !!(data as any).is_binary,
    sizeBytes: (data as any).size_bytes ?? 0,
  };
}
