// Simulated Linux-style terminal backed by the public.chat_files table.
// One persistent virtual filesystem per conversation. Shared by the
// `chat` and `run-tool` edge functions.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import JSZip from 'https://esm.sh/jszip@3.10.1';

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
  python <script.py>           run a real Python 3 script (CPython/WASM sandbox)
  python -c "code"             run inline Python (real interpreter, full stdlib)
                               imports are auto-installed when available
                               (numpy, pandas, sympy, pillow, requests, ...)
  pip install <pkg...>         install packages for this conversation
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
  const abs = resolvePath(cwd || '/', path);
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

// ==================== mini Python interpreter ====================
// Sandboxed Python subset powering the `python` terminal command. Runs fully
// in-process: no imports beyond the pre-seeded `math`/`random` modules, no def,
// and open() is bound to this conversation's virtual filesystem, so there is no
// way to reach the host system.

type PyVal = any; // eslint-disable-line @typescript-eslint/no-explicit-any

interface PyFunc {
  __pyfn: true;
  name: string;
  call: (args: PyVal[], kwargs: Record<string, PyVal>) => PyVal;
}

interface PyFileHandle {
  __pyfile: true;
  name: string;
  abs: string;
  mode: string;
  closed: boolean;
  content: string | null;
  buffer: string | null;
}

interface PyIO {
  cwd: string;
  scriptName: string;
  readText: (abs: string) => string | null;
  writeText: (abs: string, text: string, append: boolean) => string | null;
}

class PyErr extends Error {
  kind: string;
  line: number;
  constructor(kind: string, msg: string, line: number) {
    super(msg);
    this.kind = kind;
    this.line = line;
  }
}

const pyFn = (name: string, call: PyFunc['call']): PyFunc => ({ __pyfn: true, name, call });

const isPyDict = (v: PyVal): boolean =>
  !!v && typeof v === 'object' && !Array.isArray(v) && !v.__pyfn && !v.__pyfile && !v.__pymodule;

const pyType = (v: PyVal): string => {
  if (v === null || v === undefined) return 'NoneType';
  if (typeof v === 'boolean') return 'bool';
  if (typeof v === 'number') return Number.isInteger(v) ? 'int' : 'float';
  if (typeof v === 'string') return 'str';
  if (Array.isArray(v)) return 'list';
  if (v.__pyfn) return 'builtin_function_or_method';
  if (v.__pyfile) return 'file';
  if (v.__pymodule) return 'module';
  return 'dict';
};

const pyStr = (v: PyVal): string => {
  if (v === null || v === undefined) return 'None';
  if (v === true) return 'True';
  if (v === false) return 'False';
  if (typeof v === 'number') return Object.is(v, -0) ? '0' : String(v);
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return '[' + v.map(pyRepr).join(', ') + ']';
  if (v.__pyfn) return `<built-in function ${v.name}>`;
  if (v.__pyfile) return `<file '${v.name}'>`;
  if (isPyDict(v)) return '{' + Object.entries(v).map(([k, x]) => `${pyRepr(k)}: ${pyRepr(x)}`).join(', ') + '}';
  return String(v);
};

const pyRepr = (v: PyVal): string =>
  typeof v === 'string' ? `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'` : pyStr(v);

const pyTruthy = (v: PyVal): boolean => {
  if (v === null || v === undefined || v === false) return false;
  if (v === 0 || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  if (isPyDict(v)) return Object.keys(v).length > 0;
  return true;
};

const pyEq = (a: PyVal, b: PyVal): boolean => {
  if (a === b) return true;
  if ((a === null || a === undefined) && (b === null || b === undefined)) return true;
  if (typeof a === 'boolean' || typeof b === 'boolean') return a === b;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => pyEq(x, b[i]));
  if (isPyDict(a) && isPyDict(b)) {
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => k in b && pyEq(a[k], b[k]));
  }
  return false;
};

const pyNum = (v: PyVal, line: number): number => {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  throw new PyErr('TypeError', `expected a number, got '${pyType(v)}'`, line);
};

const pyCompare = (a: PyVal, b: PyVal): number => {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const sa = pyStr(a), sb = pyStr(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
};

// %-style string formatting: %s %d %f %r %% with optional width/precision.
const pyPercentFormat = (fmt: string, r: PyVal, line: number): string => {
  const vals = Array.isArray(r) ? r : [r];
  let vi = 0;
  return fmt.replace(/%(-?)(\d*)(?:\.(\d+))?([%sdfr])/g, (_m, sign: string, width: string, prec: string, code: string) => {
    if (code === '%') return '%';
    if (vi >= vals.length) throw new PyErr('TypeError', 'not enough arguments for format string', line);
    const v = vals[vi++];
    let s: string;
    if (code === 'd') s = String(Math.trunc(pyNum(v, line)));
    else if (code === 'f') s = prec ? pyNum(v, line).toFixed(parseInt(prec, 10)) : String(pyNum(v, line));
    else s = code === 'r' ? pyRepr(v) : pyStr(v);
    if (width) s = sign === '-' ? s.padEnd(parseInt(width, 10)) : s.padStart(parseInt(width, 10));
    return s;
  });
};

// Split on a separator at bracket depth 0, respecting quotes.
const pySplitTop = (text: string, sep: string): string[] => {
  const parts: string[] = [];
  let depth = 0, cur = '', q: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      cur += c;
      if (c === '\\') { cur += text[++i] ?? ''; continue; }
      if (c === q) q = null;
      continue;
    }
    if (c === '"' || c === "'") { q = c; cur += c; continue; }
    if ('([{'.includes(c)) depth++;
    if (')]}'.includes(c)) depth--;
    if (c === sep && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += c;
  }
  parts.push(cur);
  return parts;
};

interface PyTok { t: 'num' | 'str' | 'name' | 'op'; v: string; f?: boolean }

const lexPy = (src: string, line: number): PyTok[] => {
  const toks: PyTok[] = [];
  let i = 0;
  const isDigit = (c: string) => c >= '0' && c <= '9';
  const isNameStart = (c: string) => /[A-Za-z_]/.test(c);
  const isNameChar = (c: string) => /[A-Za-z0-9_]/.test(c);
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') { i++; continue; }
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1] ?? ''))) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      if (src[j] === 'e' || src[j] === 'E') {
        let k = j + 1;
        if (src[k] === '+' || src[k] === '-') k++;
        if (isDigit(src[k] ?? '')) { while (k < src.length && isDigit(src[k])) k++; j = k; }
      }
      toks.push({ t: 'num', v: src.slice(i, j) });
      i = j;
      continue;
    }
    // string with optional f prefix, single/double/triple quotes
    let f = false;
    let j = i;
    if ((c === 'f' || c === 'F') && (src[j + 1] === '"' || src[j + 1] === "'")) { f = true; j++; }
    if (src[j] === '"' || src[j] === "'") {
      let quote = src[j];
      if (src[j + 1] === src[j] && src[j + 2] === src[j]) quote = src[j].repeat(3);
      j += quote.length;
      let s = '';
      while (j < src.length && !src.startsWith(quote, j)) {
        const ch = src[j];
        if (ch === '\\' && quote.length === 1) {
          const n = src[j + 1];
          const map: Record<string, string> = { n: '\n', t: '\t', r: '\r', '0': '\0', '\\': '\\', "'": "'", '"': '"' };
          s += map[n] !== undefined ? map[n] : n;
          j += 2;
          continue;
        }
        s += ch;
        j++;
      }
      if (j >= src.length) throw new PyErr('SyntaxError', 'unterminated string literal', line);
      j += quote.length;
      toks.push({ t: 'str', v: s, f });
      i = j;
      continue;
    }
    if (isNameStart(c)) {
      let k = i;
      while (k < src.length && isNameChar(src[k])) k++;
      toks.push({ t: 'name', v: src.slice(i, k) });
      i = k;
      continue;
    }
    const three = src.slice(i, i + 3), two = src.slice(i, i + 2);
    if (three === '**=' || three === '//=') { toks.push({ t: 'op', v: three }); i += 3; continue; }
    if (['==', '!=', '<=', '>=', '**', '//', '+=', '-=', '*=', '/=', '%='].includes(two)) { toks.push({ t: 'op', v: two }); i += 2; continue; }
    if ('+-*/%()[]{},:.=<>'.includes(c)) { toks.push({ t: 'op', v: c }); i++; continue; }
    throw new PyErr('SyntaxError', `unexpected character '${c}'`, line);
  }
  return toks;
};

// Strip a trailing # comment (outside any string) from a logical line.
const pyStripComment = (s: string): string => {
  let out = '';
  let j = 0;
  let q: string | null = null;
  while (j < s.length) {
    if (q) {
      if (s[j] === '\\' && q.length === 1) { out += s.slice(j, j + 2); j += 2; continue; }
      if (s.startsWith(q, j)) { out += q; j += q.length; q = null; continue; }
      out += s[j]; j++;
      continue;
    }
    if (s.startsWith("'''", j) || s.startsWith('"""', j)) { q = s.slice(j, j + 3); out += q; j += 3; continue; }
    if (s[j] === '"' || s[j] === "'") { q = s[j]; out += s[j]; j++; continue; }
    if (s[j] === '#') break;
    out += s[j];
    j++;
  }
  return out;
};

// Returns 1 while a triple-quoted string is still open.
const pyTripleBalance = (s: string): number => {
  let bal = 0;
  let j = 0;
  let q: string | null = null;
  while (j < s.length) {
    const c = s[j];
    if (q) {
      if (c === '\\') { j += 2; continue; }
      if (c === q) q = null;
      j++;
      continue;
    }
    if (s.startsWith("'''", j) || s.startsWith('"""', j)) { bal ^= 1; j += 3; continue; }
    if (c === '"' || c === "'") { q = c; j++; continue; }
    j++;
  }
  return bal;
};

interface PyLine { text: string; indent: number; line: number }
interface PyStmt { text: string; line: number; kids: PyStmt[] }
type PyFlow = 'normal' | 'break' | 'continue';

const pyLogicalLines = (src: string): PyLine[] => {
  const raw = src.split('\n');
  const lines: PyLine[] = [];
  let i = 0;
  while (i < raw.length) {
    const startLine = i + 1;
    let text = raw[i];
    while (pyTripleBalance(text) === 1 && i + 1 < raw.length) { i++; text += '\n' + raw[i]; }
    const cleaned = pyStripComment(text);
    if (!cleaned.trim()) { i++; continue; }
    const indentMatch = cleaned.match(/^[ \t]*/);
    const indent = (indentMatch ? indentMatch[0] : '').replace(/\t/g, '    ').length;
    lines.push({ text: cleaned.trim(), indent, line: startLine });
    i++;
  }
  return lines;
};

const pyBuildTree = (lines: PyLine[]): PyStmt[] => {
  let pos = 0;
  const parseBlock = (indent: number): PyStmt[] => {
    const out: PyStmt[] = [];
    while (pos < lines.length) {
      const l = lines[pos];
      if (l.indent < indent) break;
      if (l.indent > indent) throw new PyErr('IndentationError', 'unexpected indent', l.line);
      pos++;
      const stmt: PyStmt = { text: l.text, line: l.line, kids: [] };
      if (l.text.endsWith(':')) {
        if (pos < lines.length && lines[pos].indent > indent) stmt.kids = parseBlock(lines[pos].indent);
        else throw new PyErr('IndentationError', 'expected an indented block', l.line);
      }
      out.push(stmt);
    }
    return out;
  };
  if (!lines.length) return [];
  const res = parseBlock(lines[0].indent);
  if (pos < lines.length) throw new PyErr('IndentationError', 'unexpected indent', lines[pos].line);
  return res;
};

const pyHeadWord = (t: string): string => (t.match(/^[A-Za-z_]\w*/) || [''])[0];

class PyExec {
  vars = new Map<string, PyVal>();
  out: string[] = [];
  files: PyFileHandle[] = [];
  budget = 200000;

  constructor(public io: PyIO) {
    this.seed();
  }

  fail(kind: string, msg: string, line: number): never {
    throw new PyErr(kind, msg, line);
  }

  tick(line: number): void {
    if (--this.budget <= 0) this.fail('RuntimeError', 'execution limit exceeded (too many operations)', line);
  }

  toIterable(v: PyVal, line: number): PyVal[] {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') return [...v];
    if (isPyDict(v)) return Object.keys(v);
    this.fail('TypeError', `'${pyType(v)}' object is not iterable`, line);
  }

  private seed(): void {
    const v = this.vars;
    v.set('print', pyFn('print', (args, kwargs) => {
      const sep = kwargs.sep !== undefined ? pyStr(kwargs.sep) : ' ';
      const end = kwargs.end !== undefined ? pyStr(kwargs.end) : '\n';
      this.out.push(args.map(pyStr).join(sep) + end);
      return null;
    }));
    v.set('len', pyFn('len', (a) => {
      const x = a[0];
      if (typeof x === 'string' || Array.isArray(x)) return x.length;
      if (isPyDict(x)) return Object.keys(x).length;
      throw new PyErr('TypeError', `object of type '${pyType(x)}' has no len()`, 0);
    }));
    v.set('range', pyFn('range', (a) => {
      let start = 0, stop = 0, step = 1;
      if (a.length === 1) { stop = pyNum(a[0], 0); }
      else if (a.length === 2) { start = pyNum(a[0], 0); stop = pyNum(a[1], 0); }
      else if (a.length === 3) { start = pyNum(a[0], 0); stop = pyNum(a[1], 0); step = pyNum(a[2], 0); }
      else throw new PyErr('TypeError', `range expected 1-3 arguments, got ${a.length}`, 0);
      if (step === 0) throw new PyErr('ValueError', 'range() arg 3 must not be zero', 0);
      const size = Math.max(0, Math.ceil((stop - start) / step));
      if (size > 1000000) throw new PyErr('ValueError', 'range() too large (max 1000000 items)', 0);
      const arr: number[] = [];
      for (let x = start; step > 0 ? x < stop : x > stop; x += step) arr.push(x);
      return arr;
    }));
    v.set('str', pyFn('str', (a) => (a.length ? pyStr(a[0]) : '')));
    v.set('repr', pyFn('repr', (a) => pyRepr(a[0])));
    v.set('int', pyFn('int', (a) => {
      const x = a[0];
      if (typeof x === 'number') return Math.trunc(x);
      if (typeof x === 'boolean') return x ? 1 : 0;
      if (typeof x === 'string' && /^[+-]?\d+$/.test(x.trim())) return parseInt(x.trim(), 10);
      throw new PyErr('ValueError', `invalid literal for int(): ${pyRepr(x)}`, 0);
    }));
    v.set('float', pyFn('float', (a) => {
      const x = a[0];
      if (typeof x === 'number') return x;
      if (typeof x === 'boolean') return x ? 1 : 0;
      if (typeof x === 'string' && !Number.isNaN(Number(x.trim()))) return Number(x.trim());
      throw new PyErr('ValueError', `could not convert string to float: ${pyRepr(x)}`, 0);
    }));
    v.set('bool', pyFn('bool', (a) => pyTruthy(a[0])));
    v.set('list', pyFn('list', (a) => (a.length ? [...this.toIterable(a[0], 0)] : [])));
    v.set('dict', pyFn('dict', () => ({})));
    v.set('abs', pyFn('abs', (a) => Math.abs(pyNum(a[0], 0))));
    v.set('round', pyFn('round', (a) => {
      const x = pyNum(a[0], 0);
      const n = a.length > 1 ? pyNum(a[1], 0) : 0;
      const f = Math.pow(10, n);
      return Math.round(x * f) / f;
    }));
    const minMax = (name: string, pick: (a: PyVal, b: PyVal) => boolean) =>
      pyFn(name, (a) => {
        const items = a.length === 1 ? this.toIterable(a[0], 0) : a;
        if (!items.length) throw new PyErr('ValueError', `${name}() arg is an empty sequence`, 0);
        return items.reduce((best, x) => (pick(x, best) ? x : best));
      });
    v.set('min', minMax('min', (x, b) => pyCompare(x, b) < 0));
    v.set('max', minMax('max', (x, b) => pyCompare(x, b) > 0));
    v.set('sum', pyFn('sum', (a) => this.toIterable(a[0], 0).reduce((t, x) => t + pyNum(x, 0), 0)));
    v.set('sorted', pyFn('sorted', (a) => [...this.toIterable(a[0], 0)].sort(pyCompare)));
    v.set('reversed', pyFn('reversed', (a) => [...this.toIterable(a[0], 0)].reverse()));
    v.set('enumerate', pyFn('enumerate', (a) => {
      const items = this.toIterable(a[0], 0);
      const start = a.length > 1 ? pyNum(a[1], 0) : 0;
      return items.map((x, i) => [i + start, x]);
    }));
    v.set('zip', pyFn('zip', (a) => {
      const seqs = a.map((x: PyVal) => this.toIterable(x, 0));
      const len = Math.min(...seqs.map((s: PyVal[]) => s.length));
      const out: PyVal[] = [];
      for (let i = 0; i < len; i++) out.push(seqs.map((s: PyVal[]) => s[i]));
      return out;
    }));
    v.set('type', pyFn('type', (a) => pyType(a[0])));
    v.set('chr', pyFn('chr', (a) => String.fromCodePoint(pyNum(a[0], 0))));
    v.set('ord', pyFn('ord', (a) => {
      const s = String(a[0]);
      if (s.length !== 1) throw new PyErr('TypeError', 'ord() expected a character', 0);
      return s.codePointAt(0);
    }));
    v.set('isinstance', pyFn('isinstance', (a) => {
      const t = a[1];
      const tname = t && t.__pyfn ? t.name : '';
      return pyType(a[0]) === tname || (tname === 'int' && typeof a[0] === 'boolean') || (tname === 'float' && typeof a[0] === 'number');
    }));
    v.set('open', pyFn('open', (a, kwargs) => this.pyOpen(a, kwargs, 0)));
    v.set('input', pyFn('input', () => {
      throw new PyErr('RuntimeError', 'input() is not available in this sandbox', 0);
    }));

    const math: PyVal = { __pymodule: true, pi: Math.PI, e: Math.E, inf: Infinity };
    const m1 = (n: string, f: (x: number) => number) => { math[n] = pyFn(`math.${n}`, (a) => f(pyNum(a[0], 0))); };
    m1('sqrt', Math.sqrt); m1('floor', Math.floor); m1('ceil', Math.ceil); m1('trunc', Math.trunc);
    m1('fabs', Math.abs); m1('exp', Math.exp); m1('log', Math.log); m1('log2', Math.log2); m1('log10', Math.log10);
    m1('sin', Math.sin); m1('cos', Math.cos); m1('tan', Math.tan);
    m1('asin', Math.asin); m1('acos', Math.acos); m1('atan', Math.atan);
    math.pow = pyFn('math.pow', (a) => Math.pow(pyNum(a[0], 0), pyNum(a[1], 0)));
    math.atan2 = pyFn('math.atan2', (a) => Math.atan2(pyNum(a[0], 0), pyNum(a[1], 0)));
    math.gcd = pyFn('math.gcd', (a) => {
      let x = Math.abs(Math.trunc(pyNum(a[0], 0))), y = Math.abs(Math.trunc(pyNum(a[1], 0)));
      while (y) { const t = y; y = x % y; x = t; }
      return x;
    });
    v.set('math', math);

    const random: PyVal = { __pymodule: true };
    random.random = pyFn('random.random', () => Math.random());
    random.randint = pyFn('random.randint', (a) => {
      const lo = pyNum(a[0], 0), hi = pyNum(a[1], 0);
      return lo + Math.floor(Math.random() * (hi - lo + 1));
    });
    random.uniform = pyFn('random.uniform', (a) => pyNum(a[0], 0) + Math.random() * (pyNum(a[1], 0) - pyNum(a[0], 0)));
    random.choice = pyFn('random.choice', (a) => {
      const seq = this.toIterable(a[0], 0);
      if (!seq.length) throw new PyErr('IndexError', 'Cannot choose from an empty sequence', 0);
      return seq[Math.floor(Math.random() * seq.length)];
    });
    random.shuffle = pyFn('random.shuffle', (a) => {
      const arr = a[0];
      if (!Array.isArray(arr)) throw new PyErr('TypeError', 'shuffle() expects a list', 0);
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return null;
    });
    v.set('random', random);
  }

  // ---------- open() bound to the virtual FS ----------
  pyOpen(args: PyVal[], kwargs: Record<string, PyVal>, line: number): PyFileHandle {
    const path = args[0];
    if (typeof path !== 'string') this.fail('TypeError', 'open() first argument must be a path string', line);
    const mode = args[1] !== undefined ? String(args[1]) : (kwargs.mode !== undefined ? String(kwargs.mode) : 'r');
    const abs = resolvePath(this.io.cwd, path);
    const file: PyFileHandle = { __pyfile: true, name: path, abs, mode, closed: false, content: null, buffer: null };
    if (mode === 'r' || mode === 'rt') {
      const content = this.io.readText(abs);
      if (content === null) this.fail('FileNotFoundError', `[Errno 2] No such file or directory: '${path}'`, line);
      file.content = content;
    } else if (mode === 'w' || mode === 'wt') {
      file.buffer = '';
    } else if (mode === 'a' || mode === 'at') {
      file.buffer = this.io.readText(abs) ?? '';
    } else {
      this.fail('ValueError', `unsupported mode '${mode}' (use 'r', 'w' or 'a')`, line);
    }
    this.files.push(file);
    return file;
  }

  closeFile(file: PyFileHandle, line: number): void {
    if (file.closed) return;
    if (file.buffer !== null) {
      const werr = this.io.writeText(file.abs, file.buffer, false);
      if (werr) this.fail('OSError', werr, line);
    }
    file.closed = true;
  }

  flushFiles(): void {
    for (const f of this.files) {
      if (!f.closed && f.buffer !== null) {
        this.io.writeText(f.abs, f.buffer, false);
        f.closed = true;
      }
    }
  }

  // ---------- expression evaluation ----------
  evalExpr(text: string, line: number): PyVal {
    return this.parseTokens(lexPy(text, line), line);
  }

  parseTokens(toks: PyTok[], line: number): PyVal {
    let pos = 0;
    const peek = () => toks[pos];
    const isOp = (op: string) => { const t = toks[pos]; return !!t && t.t === 'op' && t.v === op; };
    const isName = (w: string) => { const t = toks[pos]; return !!t && t.t === 'name' && t.v === w; };
    const expectOp = (op: string) => {
      const t = toks[pos];
      if (!t || t.t !== 'op' || t.v !== op) throw new PyErr('SyntaxError', `expected '${op}'`, line);
      pos++;
    };

    const binOp = (op: string, l: PyVal, r: PyVal): PyVal => {
      const ln = typeof l === 'number' || typeof l === 'boolean';
      const rn = typeof r === 'number' || typeof r === 'boolean';
      if (op === '+') {
        if (typeof l === 'string' && typeof r === 'string') return l + r;
        if (Array.isArray(l) && Array.isArray(r)) return [...l, ...r];
        if (ln && rn) return Number(l) + Number(r);
        throw new PyErr('TypeError', `unsupported operand type(s) for +: '${pyType(l)}' and '${pyType(r)}'`, line);
      }
      if (op === '*') {
        if (typeof l === 'string' && rn) return l.repeat(Math.max(0, Math.trunc(Number(r))));
        if (ln && typeof r === 'string') return r.repeat(Math.max(0, Math.trunc(Number(l))));
        if (Array.isArray(l) && rn) { const out: PyVal[] = []; for (let i = 0; i < Math.max(0, Math.trunc(Number(r))); i++) out.push(...l); return out; }
        if (ln && rn) return Number(l) * Number(r);
        throw new PyErr('TypeError', `unsupported operand type(s) for *: '${pyType(l)}' and '${pyType(r)}'`, line);
      }
      if (op === '%' && typeof l === 'string') return pyPercentFormat(l, r, line);
      if (ln && rn) {
        const a = Number(l), b = Number(r);
        switch (op) {
          case '-': return a - b;
          case '/':
            if (b === 0) throw new PyErr('ZeroDivisionError', 'division by zero', line);
            return a / b;
          case '//':
            if (b === 0) throw new PyErr('ZeroDivisionError', 'integer division or modulo by zero', line);
            return Math.floor(a / b);
          case '%':
            if (b === 0) throw new PyErr('ZeroDivisionError', 'integer division or modulo by zero', line);
            return ((a % b) + b) % b;
          case '**': return Math.pow(a, b);
        }
      }
      throw new PyErr('TypeError', `unsupported operand type(s) for ${op}: '${pyType(l)}' and '${pyType(r)}'`, line);
    };

    const contains = (container: PyVal, item: PyVal): boolean => {
      if (typeof container === 'string') return container.includes(pyStr(item));
      if (Array.isArray(container)) return container.some((x) => pyEq(x, item));
      if (isPyDict(container)) return pyStr(item) in container;
      throw new PyErr('TypeError', `argument of type '${pyType(container)}' is not iterable`, line);
    };

    const compare = (op: string, l: PyVal, r: PyVal): PyVal => {
      if (op === '==') return pyEq(l, r);
      if (op === '!=') return !pyEq(l, r);
      if (op === 'in') return contains(r, l);
      if (op === 'not in') return !contains(r, l);
      if (op === 'is') return l === r || ((l === null || l === undefined) && (r === null || r === undefined));
      const ln = typeof l === 'number' || typeof l === 'boolean';
      const rn = typeof r === 'number' || typeof r === 'boolean';
      if (ln && rn) {
        const a = Number(l), b = Number(r);
        return op === '<' ? a < b : op === '<=' ? a <= b : op === '>' ? a > b : a >= b;
      }
      if (typeof l === 'string' && typeof r === 'string') {
        return op === '<' ? l < r : op === '<=' ? l <= r : op === '>' ? l > r : l >= r;
      }
      throw new PyErr('TypeError', `'${op}' not supported between instances of '${pyType(l)}' and '${pyType(r)}'`, line);
    };

    const parsePrimary = (): PyVal => {
      const t = toks[pos];
      if (!t) throw new PyErr('SyntaxError', 'unexpected end of expression', line);
      if (t.t === 'num') {
        pos++;
        return t.v.includes('.') || /[eE]/.test(t.v) ? parseFloat(t.v) : parseInt(t.v, 10);
      }
      if (t.t === 'str') {
        pos++;
        return t.f ? this.evalFString(t.v, line) : t.v;
      }
      if (t.t === 'name') {
        pos++;
        if (t.v === 'True') return true;
        if (t.v === 'False') return false;
        if (t.v === 'None') return null;
        if (this.vars.has(t.v)) return this.vars.get(t.v);
        throw new PyErr('NameError', `name '${t.v}' is not defined`, line);
      }
      if (t.t === 'op' && t.v === '(') {
        pos++;
        if (isOp(')')) { pos++; return []; }
        const first = parseTernary();
        if (isOp(',')) {
          const items = [first];
          while (isOp(',')) { pos++; if (isOp(')')) break; items.push(parseTernary()); }
          expectOp(')');
          return items;
        }
        expectOp(')');
        return first;
      }
      if (t.t === 'op' && t.v === '[') {
        pos++;
        const items: PyVal[] = [];
        if (!isOp(']')) {
          items.push(parseTernary());
          while (isOp(',')) { pos++; if (isOp(']')) break; items.push(parseTernary()); }
        }
        expectOp(']');
        return items;
      }
      if (t.t === 'op' && t.v === '{') {
        pos++;
        const obj: Record<string, PyVal> = {};
        if (!isOp('}')) {
          for (;;) {
            const k = parseTernary();
            expectOp(':');
            obj[pyStr(k)] = parseTernary();
            if (isOp(',')) { pos++; if (isOp('}')) break; continue; }
            break;
          }
        }
        expectOp('}');
        return obj;
      }
      throw new PyErr('SyntaxError', `unexpected '${t.v}'`, line);
    };

    const normIdx = (n: number, len: number): number => {
      let i = Math.trunc(n);
      if (i < 0) i += len;
      if (i < 0 || i >= len) throw new PyErr('IndexError', 'index out of range', line);
      return i;
    };
    const clampIdx = (n: number, len: number): number => {
      const i = Math.trunc(n);
      return i < 0 ? Math.max(len + i, 0) : Math.min(i, len);
    };

    const parsePostfix = (): PyVal => {
      let val = parsePrimary();
      for (;;) {
        if (isOp('(')) {
          pos++;
          const args: PyVal[] = [];
          const kwargs: Record<string, PyVal> = {};
          if (!isOp(')')) {
            for (;;) {
              const t = toks[pos];
              if (t && t.t === 'name' && toks[pos + 1] && toks[pos + 1].t === 'op' && toks[pos + 1].v === '=') {
                const name = t.v;
                pos += 2;
                kwargs[name] = parseTernary();
              } else {
                args.push(parseTernary());
              }
              if (isOp(',')) { pos++; if (isOp(')')) break; continue; }
              break;
            }
          }
          expectOp(')');
          if (!val || !val.__pyfn) throw new PyErr('TypeError', `'${pyType(val)}' object is not callable`, line);
          val = (val as PyFunc).call(args, kwargs);
          continue;
        }
        if (isOp('[')) {
          pos++;
          let a: PyVal = undefined, b: PyVal = undefined, isSlice = false;
          if (!isOp(':') && !isOp(']')) a = parseTernary();
          if (isOp(':')) {
            isSlice = true;
            pos++;
            if (!isOp(']')) b = parseTernary();
          }
          expectOp(']');
          if (typeof val === 'string' || Array.isArray(val)) {
            const len = val.length;
            if (isSlice) {
              const start = a === undefined || a === null ? 0 : clampIdx(pyNum(a, line), len);
              const end = b === undefined || b === null ? len : clampIdx(pyNum(b, line), len);
              val = val.slice(start, Math.max(start, end));
            } else {
              val = val[normIdx(pyNum(a, line), len)];
            }
            continue;
          }
          if (isPyDict(val)) {
            if (isSlice) throw new PyErr('TypeError', 'unhashable slice on dict', line);
            const k = pyStr(a);
            if (!(k in val)) throw new PyErr('KeyError', pyRepr(a), line);
            val = val[k];
            continue;
          }
          throw new PyErr('TypeError', `'${pyType(val)}' object is not subscriptable`, line);
        }
        if (isOp('.')) {
          pos++;
          const t = toks[pos];
          if (!t || t.t !== 'name') throw new PyErr('SyntaxError', 'expected attribute name after .', line);
          pos++;
          val = this.memberValue(val, t.v, line);
          continue;
        }
        break;
      }
      return val;
    };

    const parseUnary = (): PyVal => {
      if (isOp('-')) { pos++; return -pyNum(parseUnary(), line); }
      if (isOp('+')) { pos++; return pyNum(parseUnary(), line); }
      return parsePow();
    };
    const parsePow = (): PyVal => {
      const base = parsePostfix();
      if (isOp('**')) { pos++; return binOp('**', base, parseUnary()); }
      return base;
    };
    const parseMul = (): PyVal => {
      let l = parseUnary();
      while (isOp('*') || isOp('/') || isOp('//') || isOp('%')) {
        const op = (peek() as PyTok).v;
        pos++;
        l = binOp(op, l, parseUnary());
      }
      return l;
    };
    const parseAdd = (): PyVal => {
      let l = parseMul();
      while (isOp('+') || isOp('-')) {
        const op = (peek() as PyTok).v;
        pos++;
        l = binOp(op, l, parseMul());
      }
      return l;
    };
    const parseCmp = (): PyVal => {
      let l = parseAdd();
      for (;;) {
        if (isOp('==') || isOp('!=') || isOp('<') || isOp('<=') || isOp('>') || isOp('>=')) {
          const op = (peek() as PyTok).v;
          pos++;
          l = compare(op, l, parseAdd());
          continue;
        }
        if (isName('in')) { pos++; l = compare('in', l, parseAdd()); continue; }
        if (isName('not') && toks[pos + 1] && toks[pos + 1].t === 'name' && toks[pos + 1].v === 'in') {
          pos += 2;
          l = compare('not in', l, parseAdd());
          continue;
        }
        if (isName('is')) { pos++; l = compare('is', l, parseAdd()); continue; }
        break;
      }
      return l;
    };
    const parseNot = (): PyVal => {
      if (isName('not')) { pos++; return !pyTruthy(parseNot()); }
      return parseCmp();
    };
    const parseAnd = (): PyVal => {
      let l = parseNot();
      while (isName('and')) {
        pos++;
        if (!pyTruthy(l)) { parseNot(); continue; }
        l = parseNot();
      }
      return l;
    };
    const parseOr = (): PyVal => {
      let l = parseAnd();
      while (isName('or')) {
        pos++;
        if (pyTruthy(l)) { parseAnd(); continue; }
        l = parseAnd();
      }
      return l;
    };
    const parseTernary = (): PyVal => {
      const val = parseOr();
      if (isName('if')) {
        pos++;
        const cond = parseOr();
        if (!isName('else')) throw new PyErr('SyntaxError', "expected 'else' in conditional expression", line);
        pos++;
        const alt = parseTernary();
        return pyTruthy(cond) ? val : alt;
      }
      return val;
    };

    const result = parseTernary();
    if (pos < toks.length) throw new PyErr('SyntaxError', `unexpected '${toks[pos].v}'`, line);
    return result;
  }

  memberValue(val: PyVal, name: string, line: number): PyVal {
    if (typeof val === 'string') {
      const methods: Record<string, PyFunc> = {
        upper: pyFn('str.upper', () => val.toUpperCase()),
        lower: pyFn('str.lower', () => val.toLowerCase()),
        strip: pyFn('str.strip', () => val.trim()),
        lstrip: pyFn('str.lstrip', () => val.replace(/^\s+/, '')),
        rstrip: pyFn('str.rstrip', () => val.replace(/\s+$/, '')),
        split: pyFn('str.split', (a) => (a.length && a[0] !== null ? val.split(String(a[0])) : val.split(/\s+/).filter(Boolean))),
        join: pyFn('str.join', (a) => this.toIterable(a[0], line).map(pyStr).join(val)),
        replace: pyFn('str.replace', (a) => val.split(String(a[0])).join(String(a[1]))),
        startswith: pyFn('str.startswith', (a) => val.startsWith(String(a[0]))),
        endswith: pyFn('str.endswith', (a) => val.endsWith(String(a[0]))),
        find: pyFn('str.find', (a) => val.indexOf(String(a[0]))),
        count: pyFn('str.count', (a) => (String(a[0]) === '' ? val.length + 1 : val.split(String(a[0])).length - 1)),
        title: pyFn('str.title', () => val.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase())),
        capitalize: pyFn('str.capitalize', () => val.charAt(0).toUpperCase() + val.slice(1).toLowerCase()),
        isdigit: pyFn('str.isdigit', () => /^\d+$/.test(val)),
        isalpha: pyFn('str.isalpha', () => /^[A-Za-z]+$/.test(val)),
        zfill: pyFn('str.zfill', (a) => val.padStart(pyNum(a[0], line), '0')),
        format: pyFn('str.format', (a) => {
          let i = 0;
          return val.replace(/\{(\d*)\}/g, (_m, idx: string) => {
            const k = idx === '' ? i++ : parseInt(idx, 10);
            if (k >= a.length) throw new PyErr('IndexError', 'Replacement index out of range', line);
            return pyStr(a[k]);
          });
        }),
      };
      if (methods[name]) return methods[name];
      this.fail('AttributeError', `'str' object has no attribute '${name}'`, line);
    }
    if (Array.isArray(val)) {
      const methods: Record<string, PyFunc> = {
        append: pyFn('list.append', (a) => { val.push(a[0]); return null; }),
        extend: pyFn('list.extend', (a) => { val.push(...this.toIterable(a[0], line)); return null; }),
        insert: pyFn('list.insert', (a) => { val.splice(pyNum(a[0], line), 0, a[1]); return null; }),
        pop: pyFn('list.pop', (a) => (a.length ? val.splice((() => { let i = Math.trunc(pyNum(a[0], line)); if (i < 0) i += val.length; if (i < 0 || i >= val.length) throw new PyErr('IndexError', 'pop index out of range', line); return i; })(), 1)[0] : val.pop())),
        remove: pyFn('list.remove', (a) => {
          const i = val.findIndex((x) => pyEq(x, a[0]));
          if (i === -1) throw new PyErr('ValueError', 'list.remove(x): x not in list', line);
          val.splice(i, 1);
          return null;
        }),
        index: pyFn('list.index', (a) => {
          const i = val.findIndex((x) => pyEq(x, a[0]));
          if (i === -1) throw new PyErr('ValueError', `${pyRepr(a[0])} is not in list`, line);
          return i;
        }),
        count: pyFn('list.count', (a) => val.filter((x) => pyEq(x, a[0])).length),
        sort: pyFn('list.sort', () => { val.sort(pyCompare); return null; }),
        reverse: pyFn('list.reverse', () => { val.reverse(); return null; }),
        copy: pyFn('list.copy', () => [...val]),
      };
      if (methods[name]) return methods[name];
      this.fail('AttributeError', `'list' object has no attribute '${name}'`, line);
    }
    if (val && val.__pyfile) {
      const f = val as PyFileHandle;
      const methods: Record<string, PyFunc> = {
        read: pyFn('file.read', () => {
          if (f.closed) throw new PyErr('ValueError', 'I/O operation on closed file', line);
          return f.content ?? '';
        }),
        readlines: pyFn('file.readlines', () => {
          if (f.closed) throw new PyErr('ValueError', 'I/O operation on closed file', line);
          const c = f.content ?? '';
          if (!c) return [];
          const parts = c.split('\n');
          return parts.map((p, i) => (i < parts.length - 1 ? p + '\n' : p)).filter((p, i) => i < parts.length - 1 || p !== '');
        }),
        write: pyFn('file.write', (a) => {
          if (f.closed) throw new PyErr('ValueError', 'I/O operation on closed file', line);
          if (f.buffer === null) throw new PyErr('io.UnsupportedOperation', 'not writable', line);
          const s = pyStr(a[0]);
          f.buffer += s;
          return s.length;
        }),
        close: pyFn('file.close', () => { this.closeFile(f, line); return null; }),
      };
      if (methods[name]) return methods[name];
      this.fail('AttributeError', `'file' object has no attribute '${name}'`, line);
    }
    if (val && val.__pymodule) {
      if (name in val) return val[name];
      this.fail('AttributeError', `module has no attribute '${name}'`, line);
    }
    if (isPyDict(val)) {
      const methods: Record<string, PyFunc> = {
        keys: pyFn('dict.keys', () => Object.keys(val)),
        values: pyFn('dict.values', () => Object.values(val)),
        items: pyFn('dict.items', () => Object.entries(val)),
        get: pyFn('dict.get', (a) => (pyStr(a[0]) in val ? val[pyStr(a[0])] : a.length > 1 ? a[1] : null)),
      };
      if (methods[name]) return methods[name];
      this.fail('AttributeError', `'dict' object has no attribute '${name}'`, line);
    }
    this.fail('AttributeError', `'${pyType(val)}' object has no attribute '${name}'`, line);
  }

  evalFString(s: string, line: number): string {
    let out = '';
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (c === '{' && s[i + 1] === '{') { out += '{'; i += 2; continue; }
      if (c === '}' && s[i + 1] === '}') { out += '}'; i += 2; continue; }
      if (c === '{') {
        let j = i + 1, depth = 1, expr = '';
        while (j < s.length && depth > 0) {
          if (s[j] === '{') depth++;
          else if (s[j] === '}') { depth--; if (depth === 0) break; }
          expr += s[j];
          j++;
        }
        if (depth !== 0) this.fail('SyntaxError', "f-string: expecting '}'", line);
        let spec: string | null = null;
        const ci = pySplitTop(expr, ':');
        if (ci.length > 1) { spec = ci.slice(1).join(':'); expr = ci[0]; }
        const val = this.evalExpr(expr, line);
        out += spec !== null ? this.applyFormatSpec(val, spec, line) : pyStr(val);
        i = j + 1;
        continue;
      }
      out += c;
      i++;
    }
    return out;
  }

  applyFormatSpec(val: PyVal, spec: string, line: number): string {
    const m = spec.match(/^(\d*)(?:\.(\d+))?([df])?$/);
    if (!m) this.fail('ValueError', `unsupported format spec '${spec}' (only width, .Nf and d/f supported)`, line);
    const [, width, prec, kind] = m;
    let s: string;
    if (kind === 'f') s = pyNum(val, line).toFixed(prec ? parseInt(prec, 10) : 6);
    else if (kind === 'd') s = String(Math.trunc(pyNum(val, line)));
    else if (prec && typeof val === 'number') s = val.toFixed(parseInt(prec, 10));
    else s = pyStr(val);
    if (width) s = s.padStart(parseInt(width, 10));
    return s;
  }

  // ---------- statements ----------
  bindTargets(targets: string[], item: PyVal, line: number): void {
    if (targets.length === 1) {
      const t = targets[0].trim();
      if (!/^[A-Za-z_]\w*$/.test(t)) this.fail('SyntaxError', 'invalid loop variable', line);
      this.vars.set(t, item);
      return;
    }
    const vals = Array.isArray(item) ? item : this.toIterable(item, line);
    if (vals.length !== targets.length) this.fail('ValueError', `cannot unpack ${vals.length} value(s) into ${targets.length} variables`, line);
    targets.forEach((t, i) => this.vars.set(t.trim(), vals[i]));
  }

  assign(lhsToks: PyTok[], op: string, rhsToks: PyTok[], line: number): void {
    // tuple unpack: a, b = ...
    const topCommas: number[] = [];
    let depth = 0;
    lhsToks.forEach((t, i) => {
      if (t.t === 'op' && '([{'.includes(t.v)) depth++;
      else if (t.t === 'op' && ')]}'.includes(t.v)) depth--;
      else if (t.t === 'op' && t.v === ',' && depth === 0) topCommas.push(i);
    });
    if (topCommas.length) {
      if (op !== '=') this.fail('SyntaxError', 'augmented assignment to multiple targets is not supported', line);
      const names: string[] = [];
      let prev = 0;
      for (const ci of [...topCommas, lhsToks.length]) {
        const part = lhsToks.slice(prev, ci);
        prev = ci + 1;
        if (part.length !== 1 || part[0].t !== 'name') this.fail('SyntaxError', 'invalid assignment target', line);
        names.push(part[0].v);
      }
      this.bindTargets(names, this.parseTokens(rhsToks, line), line);
      return;
    }
    // simple name
    if (lhsToks.length === 1 && lhsToks[0].t === 'name') {
      const name = lhsToks[0].v;
      if (['True', 'False', 'None'].includes(name)) this.fail('SyntaxError', `cannot assign to ${name}`, line);
      const rhs = this.parseTokens(rhsToks, line);
      if (op === '=') { this.vars.set(name, rhs); return; }
      if (!this.vars.has(name)) this.fail('NameError', `name '${name}' is not defined`, line);
      this.vars.set(name, this.compound(op.slice(0, -1), this.vars.get(name), rhs, line));
      return;
    }
    // index assignment: name[expr]
    if (lhsToks.length >= 4 && lhsToks[0].t === 'name' && lhsToks[1].t === 'op' && lhsToks[1].v === '[' &&
        lhsToks[lhsToks.length - 1].t === 'op' && lhsToks[lhsToks.length - 1].v === ']') {
      const name = lhsToks[0].v;
      if (!this.vars.has(name)) this.fail('NameError', `name '${name}' is not defined`, line);
      const container = this.vars.get(name);
      const idxToks = lhsToks.slice(2, -1);
      if (idxToks.some((t) => t.t === 'op' && t.v === ':')) this.fail('TypeError', 'slice assignment is not supported', line);
      const idx = this.parseTokens(idxToks, line);
      const rhs = this.parseTokens(rhsToks, line);
      if (Array.isArray(container)) {
        let i = Math.trunc(pyNum(idx, line));
        if (i < 0) i += container.length;
        if (i < 0 || i >= container.length) this.fail('IndexError', 'list assignment index out of range', line);
        container[i] = op === '=' ? rhs : this.evalCompound(container[i], op, rhs, line);
        return;
      }
      if (isPyDict(container)) {
        const k = pyStr(idx);
        container[k] = op === '=' ? rhs : this.evalCompound(container[k], op, rhs, line);
        return;
      }
      if (typeof container === 'string') this.fail('TypeError', "'str' object does not support item assignment", line);
      this.fail('TypeError', `'${pyType(container)}' object does not support item assignment`, line);
    }
    this.fail('SyntaxError', 'invalid assignment target', line);
  }

  private evalCompound(cur: PyVal, op: string, rhs: PyVal, line: number): PyVal {
    return this.compound(op.slice(0, -1), cur, rhs, line);
  }

  private compound(base: string, cur: PyVal, rhs: PyVal, line: number): PyVal {
    // Reuse the expression parser by injecting temp variables.
    this.vars.set('__lhs__', cur);
    this.vars.set('__rhs__', rhs);
    const result = this.parseTokens(lexPy(`__lhs__ ${base} __rhs__`, line), line);
    this.vars.delete('__lhs__');
    this.vars.delete('__rhs__');
    return result;
  }

  execBlock(stmts: PyStmt[]): PyFlow {
    let i = 0;
    while (i < stmts.length) {
      const s = stmts[i];
      this.tick(s.line);
      const kw = pyHeadWord(s.text);

      if (kw === 'if') {
        let j = i;
        let executed = false;
        let flow: PyFlow = 'normal';
        for (;;) {
          const t = stmts[j];
          const tkw = pyHeadWord(t.text);
          if (j !== i && tkw !== 'elif' && tkw !== 'else') break;
          if (tkw === 'else') {
            if (!executed) flow = this.execBlock(t.kids);
            j++;
            break;
          }
          if (tkw !== 'if' && tkw !== 'elif') this.fail('SyntaxError', `invalid syntax '${t.text}'`, t.line);
          const cond = t.text.replace(/^if\b|^elif\b/, '').replace(/:\s*$/, '');
          if (!executed && pyTruthy(this.evalExpr(cond, t.line))) {
            executed = true;
            flow = this.execBlock(t.kids);
          }
          j++;
          if (j >= stmts.length) break;
          const nxt = pyHeadWord(stmts[j].text);
          if (nxt !== 'elif' && nxt !== 'else') break;
        }
        if (flow !== 'normal') return flow;
        i = j;
        continue;
      }

      if (kw === 'for') {
        const m = s.text.match(/^for\s+(.+?)\s+in\s+(.+):\s*$/s);
        if (!m) this.fail('SyntaxError', 'invalid for statement (expected: for x in iterable:)', s.line);
        const targets = pySplitTop(m[1], ',').map((t) => t.trim());
        const items = this.toIterable(this.evalExpr(m[2], s.line), s.line);
        for (const item of items) {
          this.tick(s.line);
          this.bindTargets(targets, item, s.line);
          const f = this.execBlock(s.kids);
          if (f === 'break') break;
          if (f !== 'normal' && f !== 'continue') return f;
        }
        i++;
        continue;
      }

      if (kw === 'while') {
        const cond = s.text.replace(/^while\b/, '').replace(/:\s*$/, '');
        while (pyTruthy(this.evalExpr(cond, s.line))) {
          this.tick(s.line);
          const f = this.execBlock(s.kids);
          if (f === 'break') break;
          if (f !== 'normal' && f !== 'continue') return f;
        }
        i++;
        continue;
      }

      if (kw === 'break') return 'break';
      if (kw === 'continue') return 'continue';
      if (kw === 'pass') { i++; continue; }

      if (kw === 'import' || kw === 'from') {
        const mod = s.text.replace(/^import\s+|^from\s+/, '').trim().split(/[\s.]/)[0];
        if (mod !== 'math' && mod !== 'random') {
          this.fail('ImportError', `No module named '${mod}' (only 'math' and 'random' are available in this sandbox)`, s.line);
        }
        i++;
        continue;
      }

      if (kw === 'with') {
        const m = s.text.match(/^with\s+(.+?)\s+as\s+([A-Za-z_]\w*)\s*:\s*$/s);
        if (!m) this.fail('SyntaxError', 'expected: with <expr> as <name>:', s.line);
        const val = this.evalExpr(m[1], s.line);
        this.vars.set(m[2], val);
        let flow: PyFlow = 'normal';
        try {
          flow = this.execBlock(s.kids);
        } finally {
          if (val && val.__pyfile) this.closeFile(val as PyFileHandle, s.line);
        }
        if (flow !== 'normal') return flow;
        i++;
        continue;
      }

      if (['def', 'class', 'lambda', 'try', 'except', 'finally', 'raise', 'return', 'yield', 'global', 'nonlocal', 'del', 'assert', 'async', 'await', 'elif', 'else'].includes(kw)) {
        this.fail('SyntaxError', `'${kw}' is not supported in this Python sandbox (supported: assignments, if/for/while, with, expressions)`, s.line);
      }

      // assignment or expression statement
      const toks = lexPy(s.text, s.line);
      let depthLvl = 0;
      let eqIdx = -1;
      let eqOp = '';
      const ASSIGN_OPS = ['=', '+=', '-=', '*=', '/=', '//=', '%=', '**='];
      for (let k = 0; k < toks.length; k++) {
        const t = toks[k];
        if (t.t !== 'op') continue;
        if ('([{'.includes(t.v)) depthLvl++;
        else if (')]}'.includes(t.v)) depthLvl--;
        else if (depthLvl === 0 && ASSIGN_OPS.includes(t.v)) { eqIdx = k; eqOp = t.v; break; }
      }
      if (eqIdx !== -1) {
        this.assign(toks.slice(0, eqIdx), eqOp, toks.slice(eqIdx + 1), s.line);
      } else {
        this.parseTokens(toks, s.line);
      }
      i++;
    }
    return 'normal';
  }
}

// Run a Python (subset) script against the conversation's virtual filesystem.
function runPython(src: string, io: PyIO): { stdout: string; stderr: string } {
  const exec = new PyExec(io);
  try {
    const tree = pyBuildTree(pyLogicalLines(src));
    exec.execBlock(tree);
    exec.flushFiles();
    return { stdout: exec.out.join(''), stderr: '' };
  } catch (e) {
    try { exec.flushFiles(); } catch { /* best effort */ }
    if (e instanceof PyErr) {
      return {
        stdout: exec.out.join(''),
        stderr: `Traceback (most recent call last):\n  File "${io.scriptName}", line ${e.line}\n${e.kind}: ${e.message}`,
      };
    }
    return { stdout: exec.out.join(''), stderr: `RuntimeError: ${e instanceof Error ? e.message : String(e)}` };
  }
}
