import {
  initialize,
  build,
  type OnLoadResult,
  type OnResolveResult,
  type Plugin,
  type PluginBuild,
} from 'esbuild-wasm'
import wasmUrl from 'esbuild-wasm/esbuild.wasm?url'
import type { FileMap, RunnerError } from '../types'

export const CONSOLE_SOURCE = 'zut-console'

let initPromise: Promise<void> | null = null

export function initRunner(): Promise<void> {
  if (!initPromise) {
    initPromise = initialize({ wasmURL: wasmUrl }).then(() => undefined)
  }
  return initPromise
}

function isInitPending(): boolean {
  return Boolean(initPromise)
}

/** Normalize a project file reference to a canonical path like `/index.html`. */
function resolvePath(from: string, ref: string): string {
  const base = from.startsWith('/') ? from : '/' + from
  const dir = base.includes('/') ? base.slice(0, base.lastIndexOf('/') + 1) : '/'
  let target = ref.startsWith('/') ? ref : dir + ref
  const parts: string[] = []
  for (const seg of target.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  return '/' + parts.join('/')
}

function buildVirtualFsPlugin(files: FileMap): Plugin {
  return {
    name: 'zut-vfs',
    setup(build: PluginBuild) {
      build.onResolve({ filter: /.*/ }, (args): OnResolveResult | null => {
        if (/^(https?:)?\/\//.test(args.path)) {
          return { path: args.path, external: true }
        }
        if (/^[a-z]+:/.test(args.path)) {
          return { path: args.path, external: true }
        }
        if (!args.path.startsWith('.') && !args.path.startsWith('/')) {
          return { errors: [{ text: `Cannot resolve bare import "${args.path}"` }] }
        }
        const resolved = resolvePath(args.importer === '<stdin>' ? '/index.html' : args.importer, args.path)
        if (!(resolved.slice(1) in files)) {
          return { errors: [{ text: `Could not resolve "${args.path}" (not in this project)` }] }
        }
        return { path: resolved, namespace: 'zut-vfs' }
      })

      build.onLoad({ filter: /.*/, namespace: 'zut-vfs' }, (args): OnLoadResult | null => {
        const key = args.path.slice(1)
        const source = files[key] ?? ''
        let loader: 'tsx' | 'ts' | 'jsx' | 'js' | 'css' | 'json'
        if (key.endsWith('.tsx')) loader = 'tsx'
        else if (key.endsWith('.ts') || key.endsWith('.mts')) loader = 'ts'
        else if (key.endsWith('.jsx')) loader = 'jsx'
        else if (key.endsWith('.css')) loader = 'css'
        else if (key.endsWith('.json')) loader = 'json'
        else loader = 'js'
        return { contents: source, loader, resolveDir: '/' }
      })
    },
  }
}

interface BuildResult {
  js: string
  css: string
  referenced: string[]
}

/**
 * Bundle all project JS/TS/CSS referenced from index.html into a single
 * self-contained bundle. Returns the JS bundle, CSS bundle and the list of
 * project files that were referenced.
 */
export async function bundleProject(files: FileMap): Promise<BuildResult> {
  if (!isInitPending()) throw new Error('Runner not initialized')
  const html = files['index.html']
  if (html === undefined) throw new Error('No index.html found. Create one to run this project.')

  const refs = collectReferences(html)
  const entry = refs.map((r) => `import './${r}';`).join('\n')

  let result: { outputFiles: { path: string; contents: Uint8Array }[] }
  try {
    result = await build({
      stdin: { contents: entry, resolveDir: '/', sourcefile: '<stdin>', loader: 'js' },
      bundle: true,
      format: 'iife',
      platform: 'browser',
      target: ['es2020'],
      outfile: 'out.js',
      write: false,
      logLevel: 'silent',
      plugins: [buildVirtualFsPlugin(files)],
    })
  } catch (e) {
    throw new Error('BUILD_FAILED:' + (e as { message?: string }).message)
  }

  let js = ''
  let css = ''
  for (const out of result.outputFiles) {
    const text = new TextDecoder().decode(out.contents)
    if (out.path.endsWith('.css')) css += text
    else js += text
  }
  return { js, css, referenced: refs }
}

interface HtmlRef {
  tag: 'style' | 'script'
  file: string
  raw: string
}

/**
 * Extract project-file references from index.html: <link rel="stylesheet" href="...">
 * and <script src="..."> pointing at files inside the project.
 */
export function collectReferences(html: string): string[] {
  const seen = new Set<string>()
  return collectReferenceTags(html)
    .map((r) => r.file)
    .filter((f) => !seen.has(f) && seen.add(f))
}

/** Like collectReferences but keeps the raw tag text so tags can be removed. */
function collectReferenceTags(html: string): HtmlRef[] {
  const refs: HtmlRef[] = []

  const linkRe = /<link\b[^>]*?rel\s*=\s*["']stylesheet["'][^>]*?>/gi
  const scriptRe = /<script\b[^>]*>[\s\S]*?<\/script\s*>|<script\b[^>]*\/>/gi

  for (const m of html.matchAll(linkRe)) {
    const hrefMatch = m[0].match(/\shref\s*=\s*["']([^"']+)["']/i)
    if (hrefMatch && !/^https?:/.test(hrefMatch[1])) {
      const file = resolvePath('/index.html', hrefMatch[1]).slice(1)
      refs.push({ tag: 'style', file, raw: m[0] })
    }
  }

  for (const m of html.matchAll(scriptRe)) {
    const srcMatch = m[0].match(/\ssrc\s*=\s*["']([^"']+)["']/i)
    if (srcMatch && !/^https?:/.test(srcMatch[1])) {
      const file = resolvePath('/index.html', srcMatch[1]).slice(1)
      refs.push({ tag: 'script', file, raw: m[0] })
    }
  }

  return refs
}

/**
 * Build the final srcdoc HTML for the preview iframe:
 *  - project CSS/JS is inlined from the bundle
 *  - a console-capture harness is injected so logs/errors stream back to the IDE
 */
export function buildSrcdoc(html: string, bundle: Pick<BuildResult, 'js' | 'css'> | null): string {
  let out = html
  if (bundle) {
    out = removeProjectRefs(out)
  }
  const harness = `<script>${injectConsoleHarness()}</script>`
  if (bundle && bundle.css.trim()) {
    const cssBlock = `<style data-zut-bundle="">${bundle.css}</style>`
    const headMatch = out.match(/<\s*head[^>]*>/i)
    if (headMatch) {
      const idx = headMatch.index! + headMatch[0].length
      out = out.slice(0, idx) + cssBlock + out.slice(idx)
    } else {
      out = cssBlock + out
    }
  }
  if (bundle && bundle.js.trim()) {
    const jsBlock = `<script data-zut-bundle="">${bundle.js}</script>`
    const bodyEnd = out.match(/<\s*\/\s*body\s*>/i)
    if (bodyEnd) {
      const idx = bodyEnd.index!
      out = out.slice(0, idx) + jsBlock + out.slice(idx)
    } else {
      out = out + jsBlock
    }
  }
  const headMatch = out.match(/<\s*head[^>]*>/i)
  const injectAt = headMatch ? headMatch.index! + headMatch[0].length : 0
  out = out.slice(0, injectAt) + harness + out.slice(injectAt)
  return out
}

/** Remove matched <link rel="stylesheet"> / <script src="..."> tags for project files. */
function removeProjectRefs(html: string): string {
  const refs = collectReferenceTags(html)
  let out = html
  for (const r of refs) {
    out = out.split(r.raw).join('')
  }
  return out
}

export function injectConsoleHarness(): string {
  return `
;(function () {
  var source = ${JSON.stringify(CONSOLE_SOURCE)};
  var seq = 0;
  function post(type, payload) {
    try { parent.postMessage({ source: source, type: type, id: ++seq, payload: payload }, '*'); } catch (e) {}
  }
  function typeName(v) {
    if (v === null) return 'null';
    if (v === undefined) return 'undefined';
    if (typeof v === 'string') return 'string';
    if (typeof v === 'number') return 'number';
    if (typeof v === 'boolean') return 'boolean';
    if (typeof v === 'bigint') return 'bigint';
    if (typeof v === 'symbol') return 'symbol';
    if (typeof v === 'function') return 'function';
    if (Array.isArray(v)) return 'array';
    if (v instanceof Error) return 'error';
    if (typeof v === 'object') {
      var n = v.tagName;
      if (n) return 'dom-' + String(n).toLowerCase();
      return 'object';
    }
    return 'unknown';
  }
  function fmt(v, depth, seen) {
    seen = seen || new Set();
    try {
      var t = typeName(v);
      if (t === 'null') return 'null';
      if (t === 'undefined') return 'undefined';
      if (t === 'string') return v;
      if (t === 'number' || t === 'boolean' || t === 'bigint') return String(v);
      if (t === 'symbol') return v.toString();
      if (t === 'function') return 'ƒ ' + (v.name || 'anonymous') + '()';
      if (t === 'array') {
        if (depth > 2) return '[...]';
        if (seen.has(v)) return '[Circular]';
        seen.add(v);
        var items = v.map(function (x) { return fmt(x, depth + 1, seen); });
        return '[' + items.join(', ') + ']';
      }
      if (t === 'error') return (v.name + ': ' + v.message).replace(/\\n/g, ' ');
      if (v instanceof Map || v instanceof Set) {
        if (seen.has(v)) return '[Circular]';
        seen.add(v);
        var items = [];
        v.forEach(function (val, key) { items.push(key + ' → ' + fmt(val, depth + 1, seen)); });
        return (v instanceof Map ? 'Map' : 'Set') + '(' + v.size + ') {' + items.join(', ') + '}';
      }
      if (v && v.tagName) {
        var id = v.id ? '#' + v.id : '';
        var cls = v.className && typeof v.className === 'string' ? '.' + v.className.split(' ').filter(Boolean).join('.') : '';
        return v.tagName.toLowerCase() + id + cls;
      }
      if (depth > 2) return (v.constructor && v.constructor.name) || '{}';
      if (seen.has(v)) return '[Circular]';
      seen.add(v);
      var parts = Object.keys(v).map(function (k) { return k + ': ' + fmt(v[k], depth + 1, seen); });
      return '{' + parts.join(', ') + '}';
    } catch (e) { return String(v); }
  }
  function formatArgs(args, level) {
    var first = args.length && typeof args[0] === 'string' ? args[0] : null;
    var i = 0;
    var out = [];
    args.forEach(function (arg) {
      if (i === 0 && first !== null) { out.push(arg); }
      else { out.push(fmt(arg, 0)); }
      i++;
    });
    return out.join(' ');
  }
  ['log', 'info', 'warn', 'error', 'debug'].forEach(function (level) {
    var orig = console[level] ? console[level].bind(console) : function () {};
    console[level] = function () {
      var args = Array.prototype.slice.call(arguments);
      try { post('console', { level: level, message: formatArgs(args, level) }); } catch (e) {}
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
`
}

export function formatBuildErrors(e: unknown): RunnerError[] {
  const failures = (e as { message?: string }).message ?? 'Unknown build error'
  const prefix = 'BUILD_FAILED:'
  const raw = failures.startsWith(prefix) ? failures.slice(prefix.length) : failures
  const errors: RunnerError[] = []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed.errors)) {
      for (const err of parsed.errors) {
        errors.push({
          message: err.text,
          location: err.location
            ? { line: err.location.line, column: err.location.column }
            : undefined,
        })
      }
    } else {
      errors.push({ message: raw })
    }
  } catch {
    errors.push({ message: raw })
  }
  return errors.length ? errors : [{ message: raw }]
}