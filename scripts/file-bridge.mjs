#!/usr/bin/env node
// zut — opencode file bridge
// Syncs the browser IDE's virtual project to a directory on disk so the
// opencode server (running in that directory) can read/edit the files with
// its agent tools. The IDE then pulls the changed files back after a turn.
//
// Run this next to the opencode server on the machine that hosts the agent —
// the browser only makes HTTP calls, so the agent's compute and file access
// stay on the server.
//
// Endpoints:
//   POST /write      { files: { path: content } }  → write/overwrite files
//   GET  /read-tree  → { files: { path: content } }
//   GET  /health     → { ok: true }
//
// Env:
//   ZUT_BRIDGE_PORT    port to listen on        (default 4331)
//   ZUT_BRIDGE_HOST    interface to bind        (default 127.0.0.1)
//   ZUT_WORKSPACE      directory to sync into   (default ~/.zut-projects/default)
//   ZUT_BRIDGE_TOKEN   optional shared secret; when set, every request must
//                      send `Authorization: Bearer <token>`
//   ZUT_BRIDGE_MAX_BODY  max request bytes      (default 8 MB)

import http from 'node:http'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const PORT = Number(process.env.ZUT_BRIDGE_PORT ?? 4331)
const HOST = process.env.ZUT_BRIDGE_HOST ?? '127.0.0.1'
const TOKEN = process.env.ZUT_BRIDGE_TOKEN ?? ''
const MAX_BODY = Number(process.env.ZUT_BRIDGE_MAX_BODY ?? 8 * 1024 * 1024)
const ROOT = path.resolve(
  process.env.ZUT_WORKSPACE ?? path.join(os.homedir(), '.zut-projects', 'default'),
)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization',
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...CORS })
  res.end(JSON.stringify(data))
}

function authorized(req) {
  if (!TOKEN) return true
  return (req.headers.authorization ?? '') === `Bearer ${TOKEN}`
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function safe(p) {
  const clean = path.normalize(p).replace(/\\/g, '/')
  if (clean.startsWith('/') || clean.split('/').includes('..')) return null
  if (clean === '' || clean === '.') return null
  return clean
}

async function readTree(dir) {
  const out = {}
  let entries = []
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (e.name === '.git' || e.name === 'node_modules') continue
    const full = path.join(dir, e.name)
    const rel = path.relative(ROOT, full).replace(/\\/g, '/')
    if (e.isDirectory()) {
      Object.assign(out, await readTree(full))
    } else if (e.isFile()) {
      try {
        out[rel] = await fs.readFile(full, 'utf8')
      } catch {
        /* binary/unreadable — skip */
      }
    }
  }
  return out
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS)
    res.end()
    return
  }

  const url = new URL(req.url, `http://${req.headers.host}`)

  if (!authorized(req)) {
    json(res, 401, { error: 'unauthorized' })
    return
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    json(res, 200, { ok: true, root: ROOT })
    return
  }

  if (req.method === 'GET' && url.pathname === '/read-tree') {
    const files = await readTree(ROOT)
    json(res, 200, { files })
    return
  }

  if (req.method === 'POST' && url.pathname === '/write') {
    let parsed
    try {
      parsed = JSON.parse((await readBody(req)) || '{}')
    } catch {
      json(res, 400, { error: 'invalid JSON body' })
      return
    }
    const files = parsed.files
    if (!files || typeof files !== 'object') {
      json(res, 400, { error: 'expected { files: { path: content } }' })
      return
    }
    let wrote = 0
    for (const [p, content] of Object.entries(files)) {
      const target = safe(p)
      if (!target) {
        json(res, 400, { error: `unsafe path: ${p}` })
        return
      }
      const full = path.join(ROOT, target)
      await fs.mkdir(path.dirname(full), { recursive: true })
      await fs.writeFile(full, String(content), 'utf8')
      wrote++
    }
    json(res, 200, { ok: true, wrote })
    return
  }

  json(res, 404, { error: 'not found' })
})

await fs.mkdir(ROOT, { recursive: true })
server.listen(PORT, HOST, () => {
  console.log(`[zut-bridge] listening on http://${HOST}:${PORT}  (auth ${TOKEN ? 'on' : 'off'})`)
  console.log(`[zut-bridge] workspace ${ROOT}`)
  if (!['127.0.0.1', 'localhost', '::1'].includes(HOST) && !TOKEN) {
    console.warn('[zut-bridge] WARNING: bound to a non-local interface with auth OFF — anyone on the network can write files. Set ZUT_BRIDGE_TOKEN.')
  }
})