// Real sandboxed CPython runtime for the AI terminal, powered by Pyodide
// (CPython 3.12 compiled to WebAssembly). Runs actual Python code with actual
// packages (numpy, pandas, requests-free stdlib, micropip installs, ...) inside
// the WASM sandbox — no host filesystem, no host processes.
//
// The conversation's virtual filesystem is mounted into Pyodide's in-memory
// MEMFS at SANDBOX_ROOT before execution and snapshotted back afterwards, so
// files created by Python persist in the chat's virtual filesystem.

const PYODIDE_VERSION = '0.26.4';
const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;

export const SANDBOX_ROOT = '/sandbox';
export const PY_MAX_OUTPUT_CHARS = 20000;

export interface PyFile {
  /** absolute path in the virtual filesystem, e.g. /src/main.py */
  path: string;
  isDir: boolean;
  bytes: Uint8Array;
}

export interface PythonRunOptions {
  /** source code to execute */
  source: string;
  /** name shown in tracebacks */
  scriptName?: string;
  /** cwd inside the virtual filesystem, e.g. /src */
  cwd?: string;
  /** current virtual filesystem contents */
  files: PyFile[];
  /** extra packages to preload (from `pip install`) */
  packages?: string[];
  /** hard wall-clock budget */
  timeoutMs?: number;
}

export interface PythonRunResult {
  stdout: string;
  stderr: string;
  /** full snapshot of the sandbox filesystem after the run */
  files: PyFile[];
  /** packages that were installed during this run */
  installed: string[];
}

// deno-lint-ignore no-explicit-any
type Pyodide = any;

let pyodidePromise: Promise<Pyodide> | null = null;
const loadedPackages = new Set<string>();

async function getPyodide(): Promise<Pyodide> {
  if (!pyodidePromise) {
    pyodidePromise = (async () => {
      const mod = await import(`${PYODIDE_INDEX_URL}pyodide.mjs`);
      const py = await mod.loadPyodide({ indexURL: PYODIDE_INDEX_URL, stdLibURL: undefined });
      py.FS.mkdirTree(SANDBOX_ROOT);
      return py;
    })().catch((e) => {
      pyodidePromise = null;
      throw e;
    });
  }
  return pyodidePromise;
}

/** Modules shipped with Pyodide's package set (loaded via loadPackage). */
const PYODIDE_PACKAGE_MODULES: Record<string, string> = {
  numpy: 'numpy',
  pandas: 'pandas',
  scipy: 'scipy',
  sympy: 'sympy',
  matplotlib: 'matplotlib',
  PIL: 'pillow',
  pillow: 'pillow',
  sklearn: 'scikit-learn',
  bs4: 'beautifulsoup4',
  lxml: 'lxml',
  yaml: 'pyyaml',
  requests: 'requests',
  networkx: 'networkx',
  regex: 'regex',
  pytz: 'pytz',
  dateutil: 'python-dateutil',
  openpyxl: 'openpyxl',
  cryptography: 'cryptography',
  pydantic: 'pydantic',
  attrs: 'attrs',
  jinja2: 'Jinja2',
  markdown: 'markdown',
  micropip: 'micropip',
};

const STDLIB_HINT = new Set([
  'os', 'sys', 'json', 'math', 'random', 'time', 'datetime', 're', 'itertools', 'functools',
  'collections', 'statistics', 'string', 'textwrap', 'pathlib', 'io', 'base64', 'hashlib',
  'zipfile', 'tarfile', 'csv', 'sqlite3', 'typing', 'dataclasses', 'enum', 'decimal',
  'fractions', 'heapq', 'bisect', 'copy', 'pprint', 'uuid', 'shutil', 'glob', 'struct',
  'binascii', 'gzip', 'bz2', 'lzma', 'unicodedata', 'html', 'urllib', 'xml', 'secrets',
  'abc', 'contextlib', 'operator', 'traceback', 'warnings', 'logging', 'subprocess', 'platform',
]);

function detectImports(src: string): string[] {
  const names = new Set<string>();
  const re = /^[ \t]*(?:import[ \t]+([A-Za-z_][\w. ,]*)|from[ \t]+([A-Za-z_][\w.]*)[ \t]+import)/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const part = m[1] ?? m[2] ?? '';
    for (const chunk of part.split(',')) {
      const top = chunk.trim().split(/[. \t]/)[0];
      if (top && !STDLIB_HINT.has(top)) names.add(top);
    }
  }
  return [...names];
}

async function ensurePackages(py: Pyodide, modules: string[]): Promise<{ installed: string[]; warnings: string[] }> {
  const installed: string[] = [];
  const warnings: string[] = [];
  for (const mod of modules) {
    const pkg = PYODIDE_PACKAGE_MODULES[mod] ?? mod;
    if (loadedPackages.has(pkg)) continue;
    try {
      await py.loadPackage(pkg, { messageCallback: () => {}, errorCallback: () => {} });
      loadedPackages.add(pkg);
      installed.push(pkg);
      continue;
    } catch { /* not a bundled package — try micropip */ }
    try {
      if (!loadedPackages.has('micropip')) {
        await py.loadPackage('micropip', { messageCallback: () => {}, errorCallback: () => {} });
        loadedPackages.add('micropip');
      }
      const micropip = py.pyimport('micropip');
      await micropip.install(pkg);
      loadedPackages.add(pkg);
      installed.push(pkg);
    } catch (e) {
      warnings.push(`could not install '${pkg}': ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { installed, warnings };
}

/** Install packages explicitly (used by the terminal's `pip install`). */
export async function pipInstall(packages: string[]): Promise<{ installed: string[]; warnings: string[] }> {
  const py = await getPyodide();
  return await ensurePackages(py, packages);
}

const toSandbox = (p: string) => (p === '/' ? SANDBOX_ROOT : SANDBOX_ROOT + p);
const fromSandbox = (p: string) => {
  const rest = p.slice(SANDBOX_ROOT.length);
  return rest === '' ? '/' : rest;
};

function mountFiles(py: Pyodide, files: PyFile[]) {
  // Clear previous sandbox contents so runs are isolated.
  try { py.FS.rmdir?.(SANDBOX_ROOT); } catch { /* non-empty */ }
  const wipe = (dir: string) => {
    let entries: string[] = [];
    try { entries = py.FS.readdir(dir).filter((e: string) => e !== '.' && e !== '..'); } catch { return; }
    for (const e of entries) {
      const full = dir === '/' ? `/${e}` : `${dir}/${e}`;
      const stat = py.FS.stat(full);
      if (py.FS.isDir(stat.mode)) { wipe(full); try { py.FS.rmdir(full); } catch { /* ignore */ } }
      else { try { py.FS.unlink(full); } catch { /* ignore */ } }
    }
  };
  try { py.FS.mkdirTree(SANDBOX_ROOT); } catch { /* exists */ }
  wipe(SANDBOX_ROOT);

  const dirs = new Set<string>();
  for (const f of files) {
    const target = toSandbox(f.path);
    if (f.isDir) dirs.add(target);
    else dirs.add(target.slice(0, target.lastIndexOf('/')) || SANDBOX_ROOT);
  }
  for (const d of [...dirs].sort()) { try { py.FS.mkdirTree(d); } catch { /* ignore */ } }
  for (const f of files) {
    if (f.isDir) continue;
    try { py.FS.writeFile(toSandbox(f.path), f.bytes); } catch { /* ignore */ }
  }
}

function snapshot(py: Pyodide): PyFile[] {
  const out: PyFile[] = [];
  const walk = (dir: string) => {
    let entries: string[] = [];
    try { entries = py.FS.readdir(dir).filter((e: string) => e !== '.' && e !== '..'); } catch { return; }
    for (const e of entries) {
      const full = `${dir}/${e}`;
      let stat;
      try { stat = py.FS.stat(full); } catch { continue; }
      if (py.FS.isDir(stat.mode)) {
        out.push({ path: fromSandbox(full), isDir: true, bytes: new Uint8Array() });
        walk(full);
      } else {
        let bytes = new Uint8Array();
        try { bytes = new Uint8Array(py.FS.readFile(full, { encoding: 'binary' })); } catch { /* ignore */ }
        out.push({ path: fromSandbox(full), isDir: false, bytes });
      }
    }
  };
  walk(SANDBOX_ROOT);
  return out;
}

const clamp = (s: string) =>
  s.length > PY_MAX_OUTPUT_CHARS ? s.slice(0, PY_MAX_OUTPUT_CHARS) + `\n… (output truncated at ${PY_MAX_OUTPUT_CHARS} chars)` : s;

export async function runPythonSandbox(opts: PythonRunOptions): Promise<PythonRunResult> {
  const { source, files, scriptName = '<string>', cwd = '/', packages = [], timeoutMs = 25000 } = opts;

  let py: Pyodide;
  try {
    py = await getPyodide();
  } catch (e) {
    return {
      stdout: '',
      stderr: `python: runtime unavailable: ${e instanceof Error ? e.message : String(e)}`,
      files, installed: [],
    };
  }

  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  py.setStdout({ batched: (s: string) => stdoutChunks.push(s + '\n') });
  py.setStderr({ batched: (s: string) => stderrChunks.push(s + '\n') });

  const wanted = [...new Set([...packages, ...detectImports(source)])];
  const { installed, warnings } = await ensurePackages(py, wanted);
  for (const w of warnings) stderrChunks.push(`python: ${w}\n`);

  mountFiles(py, files);

  const workdir = toSandbox(cwd);
  try { py.FS.mkdirTree(workdir); } catch { /* ignore */ }
  try { py.FS.chdir(workdir); } catch { py.FS.chdir(SANDBOX_ROOT); }

  py.globals.set('__crossi_src__', source);
  py.globals.set('__crossi_name__', scriptName);

  const runner = `
import sys, traceback
sys.argv = [__crossi_name__]
if ${JSON.stringify(SANDBOX_ROOT)} not in sys.path:
    sys.path.insert(0, ${JSON.stringify(SANDBOX_ROOT)})
__crossi_err__ = ""
try:
    exec(compile(__crossi_src__, __crossi_name__, "exec"), {"__name__": "__main__", "__file__": __crossi_name__})
except SystemExit:
    pass
except BaseException:
    __crossi_err__ = traceback.format_exc()
__crossi_err__
`;

  let tracebackText = '';
  try {
    const result = await Promise.race([
      py.runPythonAsync(runner),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('__timeout__')), timeoutMs)),
    ]);
    tracebackText = typeof result === 'string' ? result : '';
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    tracebackText = msg === '__timeout__'
      ? `python: execution timed out after ${Math.round(timeoutMs / 1000)}s`
      : `python: ${msg}`;
  } finally {
    try { py.globals.delete('__crossi_src__'); py.globals.delete('__crossi_name__'); } catch { /* ignore */ }
  }

  const snap = snapshot(py);
  if (tracebackText) stderrChunks.push(tracebackText.endsWith('\n') ? tracebackText : tracebackText + '\n');

  return {
    stdout: clamp(stdoutChunks.join('')),
    stderr: clamp(stderrChunks.join('')).replace(/\n$/, ''),
    files: snap,
    installed,
  };
}
