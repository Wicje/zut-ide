// Minimal Node debugger over the Chrome DevTools Protocol.
//
// One session per host, one entry file, no arbitrary argv: `node
// --inspect-brk=127.0.0.1:0 <entry>` with breakpoints by file URL. This covers
// the v1 surface (breakpoints, continue/step, call stack, variables, evaluate)
// without a DAP proxy or vscode-js-debug.

import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import WebSocket from 'ws'
import { safeJoin, isIgnoredPath } from './lib.mjs'
import { sandboxEnv } from '../server/security.mjs'

const MAX_ENTRY_BYTES = 2 * 1024 * 1024
const CONNECT_TIMEOUT_MS = 10_000
const SCRIPT_EXTS = new Set(['.js', '.mjs', '.cjs'])
const TS_EXTS = new Set(['.ts', '.mts', '.cts'])
const NODE_MAJOR = Number(process.versions.node.split('.')[0])

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class DebugSession {
  constructor({ workspace, jail = false, onEvent }) {
    this.workspace = workspace
    this.jail = jail
    this.onEvent = onEvent
    this.child = null
    this.cdp = null
    this.nextId = 0
    this.pending = new Map()
    this.breakpoints = new Map() // request id -> CDP breakpointId
    this.scriptUrls = new Map() // scriptId -> file URL
    this.paused = null
    this.running = false
    this.disposed = false
    this.stderr = ''
  }

  emit(event) {
    if (!this.disposed) this.onEvent(event)
  }

  async start(entry, stopOnEntry = true) {
    if (this.child) throw new Error('A debug session is already running.')
    const target = safeJoin(this.workspace, entry)
    if (!target) throw new Error('Unsafe entry path.')
    if (isIgnoredPath(entry)) throw new Error('Refusing to debug an ignored path.')
    const ext = path.extname(target).toLowerCase()
    const isTs = TS_EXTS.has(ext)
    if (!SCRIPT_EXTS.has(ext) && !isTs) {
      throw new Error('Debug runs .js/.mjs/.cjs and (Node 22+) .ts/.mts/.cts. Compile .tsx/JSX first.')
    }
    if (isTs && NODE_MAJOR < 22) {
      throw new Error(`TypeScript debugging needs Node 22+ (this host runs Node ${process.versions.node}).`)
    }
    const stat = await fs.stat(target).catch(() => null)
    if (!stat?.isFile()) throw new Error(`Entry not found: ${entry}`)
    if (stat.size > MAX_ENTRY_BYTES) throw new Error('Entry file is too large to debug.')

    const env = this.jail
      ? sandboxEnv(this.workspace)
      : {
          ...process.env,
          NODE_ENV: process.env.NODE_ENV ?? 'development',
        }
    for (const key of ['ZUT_HOST_TOKEN', 'SUPABASE_SERVICE_ROLE_KEY', 'OPENROUTER_API_KEY', 'GEMINI_API_KEY']) {
      delete env[key]
    }

    // Node strips types natively; 22.x still needs the flag (23+ is default).
    const typeArgs = isTs && NODE_MAJOR === 22 ? ['--experimental-strip-types'] : []
    const args = [...typeArgs, '--inspect-brk=127.0.0.1:0', '--enable-source-maps', target]
    const child = spawn(process.execPath, args, {
      cwd: this.workspace,
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    this.child = child
    this.running = true

    child.stdout.on('data', (chunk) => this.emit({ type: 'output', stream: 'stdout', data: String(chunk) }))
    child.stderr.on('data', (chunk) => {
      const text = String(chunk)
      this.stderr += text
      if (this.stderr.length > 64 * 1024) this.stderr = this.stderr.slice(-64 * 1024)
      this.emit({ type: 'output', stream: 'stderr', data: text })
      // Node keeps the process alive while an inspector is attached. Once the
      // script finishes it waits here; drop the socket so the child can exit.
      if (text.includes('Waiting for the debugger to disconnect')) {
        setTimeout(() => {
          try {
            this.cdp?.close()
          } catch {
            /* already gone */
          }
        }, 50)
      }
    })
    child.on('exit', (code, signal) => {
      this.emit({ type: 'exit', code, signal })
      this.cleanup()
    })

    const wsUrl = await this.waitForInspectorUrl()
    await this.connect(wsUrl)
    await this.send('Runtime.enable')
    await this.send('Debugger.enable')
    await this.send('Runtime.runIfWaitingForDebugger')
    if (!stopOnEntry) {
      this.emit({ type: 'started', entry, stopOnEntry })
      await this.send('Debugger.resume')
    } else {
      this.emit({ type: 'started', entry, stopOnEntry })
    }
    return { entry, pid: child.pid }
  }

  waitForInspectorUrl() {
    return new Promise((resolve, reject) => {
      const started = Date.now()
      const timer = setInterval(() => {
        const match = this.stderr.match(/ws:\/\/[^\s]+/)
        if (match) {
          clearInterval(timer)
          resolve(match[0])
          return
        }
        if (!this.child) {
          clearInterval(timer)
          reject(new Error('Debugger process exited before listening.'))
          return
        }
        if (Date.now() - started > CONNECT_TIMEOUT_MS) {
          clearInterval(timer)
          reject(new Error('Timed out waiting for the Node inspector.'))
        }
      }, 50)
    })
  }

  connect(url) {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url, { perMessageDeflate: false, maxPayload: 8 * 1024 * 1024 })
      this.cdp = socket
      const timer = setTimeout(() => {
        socket.terminate()
        reject(new Error('Timed out connecting to the Node inspector.'))
      }, CONNECT_TIMEOUT_MS)
      socket.once('open', () => {
        clearTimeout(timer)
        resolve()
      })
      socket.once('error', (e) => {
        clearTimeout(timer)
        reject(new Error(`Inspector socket failed: ${e.message}`))
      })
      socket.on('message', (raw) => this.onMessage(raw))
      socket.on('close', () => this.cleanup())
    })
  }

  onMessage(raw) {
    let msg
    try {
      msg = JSON.parse(String(raw))
    } catch {
      return
    }
    if (msg.id && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id)
      this.pending.delete(msg.id)
      if (msg.error) reject(new Error(msg.error.message ?? 'CDP error'))
      else resolve(msg.result ?? {})
      return
    }
    if (msg.method === 'Debugger.paused') {
      this.paused = msg.params
      this.running = false
      this.emitPaused(msg.params)
      return
    }
    if (msg.method === 'Debugger.resumed') {
      this.paused = null
      this.running = true
      this.emit({ type: 'resumed' })
      return
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = (msg.params.args ?? [])
        .map((a) => a.value ?? a.description ?? a.type)
        .join(' ')
      this.emit({ type: 'console', level: msg.params.type, text })
      return
    }
    if (msg.method === 'Debugger.scriptParsed') {
      const url = msg.params?.url ?? ''
      if (msg.params?.scriptId && url) this.scriptUrls.set(msg.params.scriptId, url)
      if (url.startsWith('file://')) {
        this.emit({
          type: 'script',
          url,
          path: decodeURIComponent(url.replace('file://', '')),
          scriptId: msg.params.scriptId,
        })
      }
    }
  }

  send(method, params = {}) {
    if (!this.cdp || this.cdp.readyState !== 1) return Promise.reject(new Error('Debugger is not connected.'))
    const id = ++this.nextId
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Inspector timed out on ${method}.`))
      }, 15_000)
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer)
          resolve(value)
        },
        reject: (err) => {
          clearTimeout(timer)
          reject(err)
        },
      })
      this.cdp.send(JSON.stringify({ id, method, params }))
    })
  }

  async setBreakpoints(list) {
    for (const id of this.breakpoints.values()) {
      await this.send('Debugger.removeBreakpoint', { breakpointId: id }).catch(() => {})
    }
    this.breakpoints.clear()
    const verified = []
    for (const bp of Array.isArray(list) ? list.slice(0, 200) : []) {
      const target = safeJoin(this.workspace, bp?.path)
      const line = Number(bp?.line)
      if (!target || !Number.isInteger(line) || line < 1) continue
      const url = pathToFileURL(target).href
      try {
        const r = await this.send('Debugger.setBreakpointByUrl', {
          url,
          lineNumber: line - 1,
          columnNumber: 0,
        })
        this.breakpoints.set(`${bp.path}:${line}`, r.breakpointId)
        verified.push({ path: bp.path, line, verified: (r.locations ?? []).length > 0 })
      } catch {
        verified.push({ path: bp.path, line, verified: false })
      }
    }
    this.emit({ type: 'breakpoints', breakpoints: verified })
    return verified
  }

  async emitPaused(params) {
    const frames = []
    for (const frame of (params.callFrames ?? []).slice(0, 30)) {
      const url = frame.url || this.scriptUrls.get(frame.location?.scriptId) || ''
      frames.push({
        id: frame.callFrameId,
        functionName: frame.functionName || '(anonymous)',
        url,
        path: url.startsWith('file://') ? decodeURIComponent(url.replace('file://', '')) : url,
        line: frame.location.lineNumber + 1,
        column: frame.location.columnNumber + 1,
      })
    }
    const top = params.callFrames?.[0]
    const scopes = []
    if (top) {
      for (const scope of (top.scopeChain ?? []).slice(0, 4)) {
        if (scope.type === 'global') continue
        try {
          const r = await this.send('Runtime.getProperties', {
            objectId: scope.object.objectId,
            ownProperties: true,
            generatePreview: true,
          })
          const vars = (r.result ?? [])
            .filter((p) => p.value && p.value.type !== 'function')
            .slice(0, 50)
            .map((p) => ({
              name: p.name,
              type: p.value.type,
              value: p.value.value ?? p.value.description ?? p.value.unserializableValue ?? '',
            }))
          scopes.push({ type: scope.type, variables: vars })
        } catch {
          /* scope disappeared */
        }
      }
    }
    this.emit({ type: 'paused', reason: params.reason, frames, scopes })
  }

  async command(name, args = {}) {
    if (name === 'continue' || name === 'resume') return this.send('Debugger.resume')
    if (name === 'pause') return this.send('Debugger.pause')
    if (name === 'stepOver' || name === 'next') return this.send('Debugger.stepOver')
    if (name === 'stepInto') return this.send('Debugger.stepInto')
    if (name === 'stepOut') return this.send('Debugger.stepOut')
    if (name === 'evaluate') {
      const callFrameId = args.frameId ?? this.paused?.callFrames?.[0]?.callFrameId
      if (!callFrameId) throw new Error('Nothing is paused.')
      const expression = String(args.expression ?? '')
      if (!expression || expression.length > 2000) throw new Error('Expression is empty or too long.')
      const r = await this.send('Debugger.evaluateOnCallFrame', {
        callFrameId,
        expression,
        returnByValue: true,
        generatePreview: true,
        silent: false,
      })
      if (r.exceptionDetails) {
        throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text ?? 'Evaluation failed.')
      }
      const v = r.result ?? {}
      return {
        value: v.value ?? v.description ?? v.unserializableValue ?? '',
        type: v.type,
        result: { value: v.value ?? v.description ?? v.unserializableValue ?? '', type: v.type },
      }
    }
    throw new Error(`Unknown debug command: ${name}`)
  }

  async stop() {
    if (this.child) {
      try {
        this.child.kill('SIGTERM')
      } catch {
        /* already gone */
      }
      await delay(150)
      try {
        this.child.kill('SIGKILL')
      } catch {
        /* already gone */
      }
    }
    this.cleanup()
  }

  cleanup() {
    if (this.disposed) return
    this.disposed = true
    this.child = null
    this.paused = null
    this.running = false
    for (const { reject } of this.pending.values()) reject(new Error('Debug session ended.'))
    this.pending.clear()
    try {
      this.cdp?.close()
    } catch {
      /* already gone */
    }
    this.cdp = null
    this.emit({ type: 'closed' })
  }
}
