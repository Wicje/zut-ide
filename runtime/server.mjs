// zut-runtime — a tiny, dependency-light bundling service.
//
// Moves the heavy part of running a project (esbuild) off the student's device
// and onto a server, so low-end laptops and phones never have to crunch a WASM
// compiler. The browser posts the project's files; the service returns a bundle.
//
//   POST /build  { files: Record<string,string> }  ->  { js, css, referenced }
//                                                       or { errors: [...] }
//   GET  /health                                    ->  { ok, service, version }
//
// Run it:
//   node runtime/server.mjs
// or:  npm run runtime
//
// Env:
//   PORT / ZUT_RUNTIME_PORT   port to listen on        (default 8787)
//   HOST                      interface to bind        (default 0.0.0.0)
//   ZUT_RUNTIME_TOKEN         optional shared secret; when set, requests must
//                             send `Authorization: Bearer <token>`
//   ZUT_RUNTIME_MAX_BODY      max request bytes         (default 8 MB)
//
// Point the IDE at it with VITE_RUNTIME_URL (and VITE_RUNTIME_TOKEN if set).

import http from 'node:http'
import { build } from 'esbuild'

const PORT = Number(process.env.PORT ?? process.env.ZUT_RUNTIME_PORT ?? 8787)
const HOST = process.env.HOST ?? '0.0.0.0'
const TOKEN = process.env.ZUT_RUNTIME_TOKEN ?? ''
const MAX_BODY = Number(process.env.ZUT_RUNTIME_MAX_BODY ?? 8 * 1024 * 1024)
const VERSION = '0.1.0'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
}

function send(res, status, body) {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    ...CORS,
  })
  res.end(payload)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new Error(`Request body exceeds the ${Math.round(MAX_BODY / 1024 / 1024)}MB limit.`))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function authorized(req) {
  if (!TOKEN) return true
  const header = req.headers.authorization ?? ''
  return header === `Bearer ${TOKEN}`
}

// --- Virtual file system helpers (mirrors src/lib/runner.ts) ---

/** Normalize a project file reference to a canonical path like `/index.html`. */
function resolvePath(from, ref) {
  const base = from.startsWith('/') ? from : '/' + from
  const dir = base.includes('/') ? base.slice(0, base.lastIndexOf('/') + 1) : '/'
  const target = ref.startsWith('/') ? ref : dir + ref
  const parts = []
  for (const seg of target.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') parts.pop()
    else parts.push(seg)
  }
  return '/' + parts.join('/')
}

function collectReferenceTags(html) {
  const refs = []
  const linkRe = /<link\b[^>]*?rel\s*=\s*["']stylesheet["'][^>]*?>/gi
  const scriptRe = /<script\b[^>]*>[\s\S]*?<\/script\s*>|<script\b[^>]*\/>/gi

  for (const m of html.matchAll(linkRe)) {
    const hrefMatch = m[0].match(/\shref\s*=\s*["']([^"']+)["']/i)
    if (hrefMatch && !/^https?:/.test(hrefMatch[1])) {
      refs.push({ tag: 'style', file: resolvePath('/index.html', hrefMatch[1]).slice(1), raw: m[0] })
    }
  }

  for (const m of html.matchAll(scriptRe)) {
    const srcMatch = m[0].match(/\ssrc\s*=\s*["']([^"']+)["']/i)
    if (srcMatch && !/^https?:/.test(srcMatch[1])) {
      refs.push({ tag: 'script', file: resolvePath('/index.html', srcMatch[1]).slice(1), raw: m[0] })
    }
  }

  return refs
}

function collectReferences(html) {
  const seen = new Set()
  return collectReferenceTags(html)
    .map((r) => r.file)
    .filter((f) => !seen.has(f) && seen.add(f))
}

/** Directory a relative import resolves against. Prefer esbuild's `resolveDir`
 *  (always `/` from our virtual onLoad) so nested imports work even though the
 *  importer is a namespaced path like `zut-vfs:/main.ts`. */
function resolveBase(args) {
  if (args.resolveDir) return args.resolveDir.replace(/\/?$/, '/')
  return args.importer === '<stdin>' ? '/index.html' : args.importer
}

function virtualFsPlugin(files) {
  return {
    name: 'zut-runtime-vfs',
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        if (/^(https?:)?\/\//.test(args.path)) return { path: args.path, external: true }
        if (/^[a-z]+:/.test(args.path)) return { path: args.path, external: true }
        if (!args.path.startsWith('.') && !args.path.startsWith('/')) {
          return { path: `https://esm.sh/${args.path}`, external: true }
        }
        const qIdx = args.path.search(/\?/)
        const query = qIdx >= 0 ? args.path.slice(qIdx) : ''
        const clean = qIdx >= 0 ? args.path.slice(0, qIdx) : args.path
        const importer = resolveBase(args)
        const resolved = resolvePath(importer, clean)
        if (!(resolved.slice(1) in files)) {
          return { errors: [{ text: `Could not resolve "${args.path}" (not in this project)` }] }
        }
        return { path: resolved + query, namespace: 'zut-vfs' }
      })

      build.onLoad({ filter: /.*/, namespace: 'zut-vfs' }, (args) => {
        const key = args.path.slice(1)
        const source = files[key] ?? ''
        if (key.endsWith('.vue')) {
          return {
            errors: [
              {
                text: `Vue single-file components aren't supported by the remote runtime yet — open this project with the in-browser runner.`,
              },
            ],
          }
        }
        let loader = 'js'
        if (key.endsWith('.tsx')) loader = 'tsx'
        else if (key.endsWith('.ts') || key.endsWith('.mts')) loader = 'ts'
        else if (key.endsWith('.jsx')) loader = 'jsx'
        else if (key.endsWith('.css')) loader = 'css'
        else if (key.endsWith('.json')) loader = 'json'
        return { contents: source, loader, resolveDir: '/' }
      })
    },
  }
}

function serializeError(e) {
  if (e && e.location) {
    return {
      text: e.text ?? e.message ?? String(e),
      location: {
        file: e.location.file,
        line: e.location.line,
        column: e.location.column,
      },
    }
  }
  return { text: e?.text ?? e?.message ?? String(e) }
}

/** Bundle a project's referenced JS/TS/CSS into one JS + one CSS payload. */
async function bundleProject(files) {
  if (!files || typeof files !== 'object') {
    return { errors: [{ text: 'Request must include a `files` object.' }] }
  }
  const html = files['index.html']
  if (html === undefined) {
    return { errors: [{ text: 'No index.html found. Create one to run this project.' }] }
  }

  const refs = collectReferences(html)
  const entry = refs.map((r) => `import './${r}';`).join('\n')

  let result
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
      plugins: [virtualFsPlugin(files)],
    })
  } catch (e) {
    const list = Array.isArray(e?.errors) && e.errors.length ? e.errors : [e]
    return { errors: list.map(serializeError) }
  }

  let js = ''
  let css = ''
  for (const out of result.outputFiles) {
    const text = Buffer.from(out.contents).toString('utf8')
    if (out.path.endsWith('.css')) css += text
    else js += text
  }
  return { js, css, referenced: refs }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS)
    res.end()
    return
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    send(res, 200, { ok: true, service: 'zut-runtime', version: VERSION })
    return
  }

  if (req.method === 'POST' && url.pathname === '/build') {
    if (!authorized(req)) {
      send(res, 401, { error: 'Unauthorized' })
      return
    }
    try {
      const raw = await readBody(req)
      let body
      try {
        body = raw ? JSON.parse(raw) : {}
      } catch {
        send(res, 400, { error: 'Request body must be valid JSON.' })
        return
      }
      const result = await bundleProject(body.files)
      send(res, 200, result)
    } catch (e) {
      send(res, 400, { error: e?.message ?? 'Build failed' })
    }
    return
  }

  send(res, 404, { error: 'Not found' })
})

server.listen(PORT, HOST, () => {
  console.log(`zut-runtime listening on http://${HOST}:${PORT}  (auth ${TOKEN ? 'on' : 'off'})`)
})
