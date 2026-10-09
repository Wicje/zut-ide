// Ported from zut-ide: in-browser web bundling (esbuild-wasm) + sandboxed
// srcdoc preview + console harness. Web projects never touch a server.
import {
  initialize,
  build,
  type OnLoadResult,
  type OnResolveResult,
  type Plugin,
  type PluginBuild,
} from 'esbuild-wasm';
import wasmUrl from 'esbuild-wasm/esbuild.wasm?url';
import type { FileMap } from './filemap';

export const CONSOLE_SOURCE = 'zut-console';

const cloudUrl = (import.meta.env.VITE_CLOUD_URL as string | undefined)?.replace(/\/+$/, '') ?? '';

/**
 * Bundle on zut-cloud (native esbuild) instead of esbuild-wasm in the
 * browser. Throws REMOTE_UNREACHABLE when the cloud can't do it, so callers
 * fall back to the local runner. Compile errors throw BUILD_FAILED like local.
 */
export async function bundleProjectRemote(files: FileMap): Promise<BuildResult> {
  if (!cloudUrl) throw new Error('REMOTE_UNREACHABLE: cloud is not configured.');
  let res: Response;
  try {
    res = await fetch(`${cloudUrl}/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files }),
    });
  } catch (e) {
    throw new Error(`REMOTE_UNREACHABLE:${(e as Error).message}`);
  }
  const json = (await res.text().then((t) => (t ? JSON.parse(t) : null)).catch(() => null)) as {
    js?: string;
    css?: string;
    referenced?: string[];
    errors?: unknown[];
    error?: string;
  } | null;
  if (!res.ok) throw new Error(`REMOTE_UNREACHABLE:${json?.error ?? `Cloud request failed (${res.status})`}`);
  if (Array.isArray(json?.errors) && json.errors.length) {
    throw new Error('BUILD_FAILED:' + JSON.stringify({ errors: json.errors }));
  }
  return { js: json?.js ?? '', css: json?.css ?? '', referenced: json?.referenced ?? [] };
}

export interface RunnerError {
  message: string;
  location?: { line?: number; column?: number; file?: string };
}

let initPromise: Promise<void> | null = null;

export function initRunner(): Promise<void> {
  if (!initPromise) {
    initPromise = initialize({ wasmURL: wasmUrl }).then(() => undefined);
  }
  return initPromise;
}

function isInitPending(): boolean {
  return Boolean(initPromise);
}

/** Normalize a project file reference to a canonical path like `/index.html`. */
function resolvePath(from: string, ref: string): string {
  const base = from.startsWith('/') ? from : '/' + from;
  const dir = base.includes('/') ? base.slice(0, base.lastIndexOf('/') + 1) : '/';
  const target = ref.startsWith('/') ? ref : dir + ref;
  const parts: string[] = [];
  for (const seg of target.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return '/' + parts.join('/');
}

/** Map a bare import specifier to an esm.sh CDN URL so framework packages
 *  like `react` resolve in the browser preview. */
function cdnUrl(specifier: string): string {
  return `https://esm.sh/${specifier}`;
}

/** Directory a relative import resolves against. Prefer the `resolveDir` from
 *  our virtual `onLoad` (always `/`), which stays correct even for namespaced
 *  importers like `zut-vfs:/main.ts` that would otherwise break nested imports. */
function resolveBase(args: { resolveDir?: string; importer: string }): string {
  if (args.resolveDir) return args.resolveDir.replace(/\/?$/, '/');
  return args.importer === '<stdin>' ? '/index.html' : args.importer;
}

function buildVirtualFsPlugin(files: FileMap): Plugin {
  return {
    name: 'zut-vfs',
    setup(build: PluginBuild) {
      build.onResolve({ filter: /.*/ }, (args): OnResolveResult | null => {
        if (/^(https?:)?\/\//.test(args.path)) {
          return { path: args.path, external: true };
        }
        if (/^[a-z]+:/.test(args.path)) {
          return { path: args.path, external: true };
        }
        if (!args.path.startsWith('.') && !args.path.startsWith('/')) {
          return { path: cdnUrl(args.path), external: true };
        }
        const qIdx = args.path.search(/\?/);
        const query = qIdx >= 0 ? args.path.slice(qIdx) : '';
        const clean = qIdx >= 0 ? args.path.slice(0, qIdx) : args.path;
        const importer = resolveBase(args);
        const resolved = resolvePath(importer, clean);
        if (!(resolved.slice(1) in files)) {
          return { errors: [{ text: `Could not resolve "${args.path}" (not in this project)` }] };
        }
        return { path: resolved + query, namespace: 'zut-vfs' };
      });

      build.onLoad({ filter: /.*/, namespace: 'zut-vfs' }, (args): OnLoadResult | null => {
        const key = args.path.slice(1);
        const source = files[key] ?? '';

        let loader: 'tsx' | 'ts' | 'jsx' | 'js' | 'css' | 'json';
        if (key.endsWith('.tsx')) loader = 'tsx';
        else if (key.endsWith('.ts') || key.endsWith('.mts')) loader = 'ts';
        else if (key.endsWith('.jsx')) loader = 'jsx';
        else if (key.endsWith('.css')) loader = 'css';
        else if (key.endsWith('.json')) loader = 'json';
        else loader = 'js';
        return { contents: source, loader, resolveDir: '/' };
      });
    },
  };
}

interface BuildResult {
  js: string;
  css: string;
  referenced: string[];
}

/**
 * Bundle all project JS/TS/CSS referenced from index.html into a single
 * self-contained bundle. Returns the JS bundle, CSS bundle and the list of
 * project files that were referenced.
 */
export async function bundleProject(files: FileMap): Promise<BuildResult> {
  if (!isInitPending()) throw new Error('Runner not initialized');
  const html = files['index.html'];
  if (html === undefined) throw new Error('No index.html found. Create one to run this project.');

  const refs = collectReferences(html);
  const entry = refs.map((r) => `import './${r}';`).join('\n');

  let result: { outputFiles: { path: string; contents: Uint8Array }[] };
  try {
    result = await build({
      stdin: { contents: entry, resolveDir: '/', sourcefile: '<stdin>', loader: 'js' },
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: ['es2020'],
      outfile: 'out.js',
      write: false,
      logLevel: 'silent',
      plugins: [buildVirtualFsPlugin(files)],
    });
  } catch (e) {
    throw new Error('BUILD_FAILED:' + (e as { message?: string }).message);
  }

  let js = '';
  let css = '';
  for (const out of result.outputFiles) {
    const text = new TextDecoder().decode(out.contents);
    if (out.path.endsWith('.css')) css += text;
    else js += text;
  }
  return { js, css, referenced: refs };
}

interface HtmlRef {
  tag: 'style' | 'script';
  file: string;
  raw: string;
}

/**
 * Extract project-file references from index.html: <link rel="stylesheet" href="...">
 * and <script src="..."> pointing at files inside the project.
 */
export function collectReferences(html: string): string[] {
  const seen = new Set<string>();
  return collectReferenceTags(html)
    .map((r) => r.file)
    .filter((f) => !seen.has(f) && seen.add(f));
}

/** Like collectReferences but keeps the raw tag text so tags can be removed. */
function collectReferenceTags(html: string): HtmlRef[] {
  const refs: HtmlRef[] = [];

  const linkRe = /<link\b[^>]*?rel\s*=\s*["']stylesheet["'][^>]*?>/gi;
  const scriptRe = /<script\b[^>]*>[\s\S]*?<\/script\s*>|<script\b[^>]*\/>/gi;

  for (const m of html.matchAll(linkRe)) {
    const hrefMatch = m[0].match(/\shref\s*=\s*["']([^"']+)["']/i);
    if (hrefMatch && !/^https?:/.test(hrefMatch[1])) {
      const file = resolvePath('/index.html', hrefMatch[1]).slice(1);
      refs.push({ tag: 'style', file, raw: m[0] });
    }
  }

  for (const m of html.matchAll(scriptRe)) {
    const srcMatch = m[0].match(/\ssrc\s*=\s*["']([^"']+)["']/i);
    if (srcMatch && !/^https?:/.test(srcMatch[1])) {
      const file = resolvePath('/index.html', srcMatch[1]).slice(1);
      refs.push({ tag: 'script', file, raw: m[0] });
    }
  }

  return refs;
}

/**
 * Build the final srcdoc HTML for the preview iframe:
 *  - project CSS/JS is inlined from the bundle
 *  - a console-capture harness is injected so logs/errors stream back
 */
export function buildSrcdoc(html: string, bundle: Pick<BuildResult, 'js' | 'css'> | null): string {
  let out = html;
  if (bundle) {
    out = removeProjectRefs(out);
  }
  const harness = `<script>${injectConsoleHarness()}</script>`;
  if (bundle && bundle.css.trim()) {
    const cssBlock = `<style data-zut-bundle="">${bundle.css}</style>`;
    const headMatch = out.match(/<\s*head[^>]*>/i);
    if (headMatch) {
      const idx = headMatch.index! + headMatch[0].length;
      out = out.slice(0, idx) + cssBlock + out.slice(idx);
    } else {
      out = cssBlock + out;
    }
  }
  if (bundle && bundle.js.trim()) {
    const jsBlock = `<script type="module" data-zut-bundle="">${bundle.js}</script>`;
    const bodyEnd = out.match(/<\s*\/\s*body\s*>/i);
    if (bodyEnd) {
      const idx = bodyEnd.index!;
      out = out.slice(0, idx) + jsBlock + out.slice(idx);
    } else {
      out = out + jsBlock;
    }
  }
  const headMatch = out.match(/<\s*head[^>]*>/i);
  const injectAt = headMatch ? headMatch.index! + headMatch[0].length : 0;
  out = out.slice(0, injectAt) + harness + out.slice(injectAt);
  return out;
}

/** Remove matched <link rel="stylesheet"> / <script src="..."> tags for project files. */
function removeProjectRefs(html: string): string {
  const refs = collectReferenceTags(html);
  let out = html;
  for (const r of refs) {
    out = out.split(r.raw).join('');
  }
  return out;
}

export function injectConsoleHarness(): string {
  return `
;(function () {
  var source = ${JSON.stringify(CONSOLE_SOURCE)};
  var seq = 0;
  function post(type, payload) {
    try { parent.postMessage({ source: source, type: type, id: ++seq, payload: payload }, '*'); } catch (e) {}
  }
  function fmt(v, depth, seen) {
    seen = seen || new Set();
    try {
      if (v === null) return 'null';
      if (v === undefined) return 'undefined';
      if (typeof v !== 'object') return String(v);
      if (Array.isArray(v)) {
        if (depth > 2) return '[...]';
        if (seen.has(v)) return '[Circular]';
        seen.add(v);
        return '[' + v.map(function (x) { return fmt(x, depth + 1, seen); }).join(', ') + ']';
      }
      if (v instanceof Error) return (v.name + ': ' + v.message);
      if (depth > 2) return (v.constructor && v.constructor.name) || '{}';
      if (seen.has(v)) return '[Circular]';
      seen.add(v);
      var parts = Object.keys(v).map(function (k) { return k + ': ' + fmt(v[k], depth + 1, seen); });
      return '{' + parts.join(', ') + '}';
    } catch (e) { return String(v); }
  }
  ['log', 'info', 'warn', 'error', 'debug'].forEach(function (level) {
    var orig = console[level] ? console[level].bind(console) : function () {};
    console[level] = function () {
      var args = Array.prototype.slice.call(arguments);
      try { post('console', { level: level, message: args.map(function (a) { return fmt(a, 0); }).join(' ') }); } catch (e) {}
      orig.apply(null, args);
    };
  });
  window.addEventListener('error', function (ev) {
    var msg = ev.message || 'Unknown script error';
    if (ev.error && ev.error.stack) msg += '\\n' + ev.error.stack;
    post('console', { level: 'error', message: msg });
    return false;
  });
  window.addEventListener('unhandledrejection', function (ev) {
    var msg = (ev.reason && (ev.reason.message || ev.reason.stack)) ? (ev.reason.message + ' ' + ev.reason.stack) : String(ev.reason);
    post('console', { level: 'error', message: 'Unhandled promise rejection: ' + msg });
  });
  post('ready', {});
})();
`;
}

export function formatBuildErrors(e: unknown): RunnerError[] {
  const failures = (e as { message?: string }).message ?? 'Unknown build error';
  const prefix = 'BUILD_FAILED:';
  const raw = failures.startsWith(prefix) ? failures.slice(prefix.length) : failures;
  const errors: RunnerError[] = [];

  const structured = (e as { errors?: Array<{ text?: string; location?: { file?: string; line?: number; column?: number } }> }).errors;
  if (Array.isArray(structured) && structured.length) {
    for (const err of structured) {
      errors.push({
        message: err.text ?? raw,
        location: err.location
          ? { line: err.location.line, column: err.location.column, file: err.location.file }
          : parseLocationFromText(err.text ?? ''),
      });
    }
    return errors;
  }

  errors.push({ message: raw, location: parseLocationFromText(raw) });
  return errors.length ? errors : [{ message: raw, location: parseLocationFromText(raw) }];
}

function parseLocationFromText(text: string): { file?: string; line?: number; column?: number } | undefined {
  const m = text.match(/(?:^|\n)([\w@./:-]+):(\d+):(\d+):/);
  if (!m) return undefined;
  const line = Number(m[2]);
  const column = Number(m[3]);
  if (!Number.isFinite(line) || !Number.isFinite(column)) return undefined;
  return { file: m[1], line, column };
}
