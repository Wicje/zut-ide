import { useCallback, useRef, useState } from 'react'
import {
  bundleProject,
  buildSrcdoc,
  formatBuildErrors,
  initRunner,
} from '../lib/runner'
import { bundleProjectRemote, canUseRemote, runProgramRemote } from '../lib/runtime'
import { detectProjectKind, findProgramEntry } from '../lib/projectKind'
import { LIMITS } from '../lib/limits'
import { recordRun } from '../lib/usage'
import { formatQuotaMessage } from '../lib/limits'
import type {
  ConsoleEntry,
  ConsoleLevel,
  FileMap,
  ProgramResult,
  RunStage,
  RunStatus,
} from '../types'

function resolveErrorFile(file: string | undefined, files: FileMap): string | undefined {
  if (!file || file === '<stdin>') return undefined
  const cleaned = file.replace(/^[a-zA-Z][\w-]*:\/*/, '').replace(/^\.?\/+/, '')
  const candidates = [cleaned, cleaned.split('/').pop() ?? '']
  for (const candidate of candidates) {
    if (candidate && candidate in files) return candidate
  }
  return undefined
}

interface RunLoopDeps {
  files: FileMap
  consoleEntries: ConsoleEntry[]
  addConsole: (
    level: ConsoleLevel,
    message: string,
    meta?: { file?: string; line?: number; column?: number },
  ) => void
  clearConsole: () => void
}

/**
 * Build-and-run loop for web + programs, extracted from App.
 * - web (`index.html`): bundle (remote first, esbuild-wasm fallback) and
 *   render into the sandboxed preview. No AI, no account needed.
 * - python/go (no `index.html`): execute the entry on the remote runtime
 *   (`POST /run`) so <2GB devices never compile locally. Output lands in
 *   `program` and is mirrored to the console.
 * Owns srcDoc/runKey/status/buildMs/program so App stays wiring-only.
 */
export function useRunLoop({ files, consoleEntries, addConsole, clearConsole }: RunLoopDeps) {
  const [srcDoc, setSrcDoc] = useState('')
  const [runKey, setRunKey] = useState(0)
  const [status, setStatus] = useState<RunStatus>('idle')
  const [stage, setStage] = useState<RunStage | null>(null)
  const [buildMs, setBuildMs] = useState<number | null>(null)
  const [program, setProgram] = useState<ProgramResult | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const stageTimers = useRef<number[]>([])
  const wasmPromise = useRef<Promise<void> | null>(null)

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    for (const t of stageTimers.current) window.clearTimeout(t)
    stageTimers.current = []
    setStage(null)
    setStatus('error')
    addConsole('warn', 'Run cancelled. No further run time will be used.')
  }, [addConsole])
  const ensureWasm = useCallback(() => {
    if (!wasmPromise.current) wasmPromise.current = initRunner()
    return wasmPromise.current
  }, [])
  const entriesRef = useRef(consoleEntries)
  entriesRef.current = consoleEntries

  const run = useCallback(
    async (override?: FileMap, stdin = '') => {
      const target = override ?? files
      const t0 = performance.now()
      for (const t of stageTimers.current) window.clearTimeout(t)
      stageTimers.current = []
      abortRef.current = new AbortController()
      setStatus('running')
      setStage(null)
      // Autoplay fires ~900ms after every edit/new-file, which would instantly
      // erase fresh receipts ("Created …", "Added …"). Preserve a recent
      // info message across the wipe so actions stay visibly acknowledged.
      const recentInfo = [...entriesRef.current]
        .reverse()
        .find((e) => e.level === 'info' && Date.now() - e.timestamp < 3000)
      clearConsole()
      if (recentInfo) addConsole('info', recentInfo.message)

      const kind = detectProjectKind(target)
      if (kind !== 'web') {
        const entry = findProgramEntry(target, kind)
        if (!entry) {
          addConsole('error', `No entry file found (expected ${kind === 'python' ? 'main.py' : 'main.go'}).`)
          setProgram(null)
          setStatus('error')
          setStage(null)
          setBuildMs(Math.round(performance.now() - t0))
          return
        }
        // Honest staged UI: remote boots take seconds (cold start 12-22s).
        // Broker will send real stages later; simulate waking->starting locally.
        setStage('waking')
        addConsole('info', 'Starting remote computer… (waking)')
        stageTimers.current.push(
          window.setTimeout(() => {
            setStage((s) => (s === 'waking' ? 'starting' : s))
          }, LIMITS.stageAfterMs),
        )
        const browserTimeout = window.setTimeout(() => {
          abortRef.current?.abort()
          addConsole('error', 'Run took longer than 60s and was stopped. Try again — a warm computer starts faster.')
          setStatus('error')
          setStage(null)
        }, LIMITS.browserWaitMaxMs)
        try {
          const result = await runProgramRemote(target, entry, stdin)
          window.clearTimeout(browserTimeout)
          setStage('ready')
          setProgram(result)
          setSrcDoc('')
          setRunKey((k) => k + 1)
          setBuildMs(Math.round(performance.now() - t0))
          void recordRun({
            workspaceId: 'local',
            command: `run ${entry}`,
            status: result.exitCode === 0 ? 'success' : 'failed',
            exitCode: result.exitCode,
            durationMs: result.durationMs,
          })
          if (result.stdout.trim()) addConsole('log', result.stdout.slice(0, 8000))
          if (result.stderr.trim()) addConsole('error', result.stderr.slice(0, 8000))
          if (result.exitCode !== 0) {
            addConsole('error', `Exited with code ${result.exitCode ?? '?'} in ${result.durationMs}ms.`)
            setStatus('error')
          } else {
            addConsole('info', `Done in ${result.durationMs}ms.`)
            setStatus('done')
          }
          if (result.truncated) addConsole('warn', 'Output was truncated (256KB limit).')
        } catch (e) {
          window.clearTimeout(browserTimeout)
          const msg = (e as Error).message ?? 'Run failed'
          setProgram(null)
          setBuildMs(Math.round(performance.now() - t0))
          if (msg.startsWith('CANCELLED:')) {
            // cancel() already messaged
          } else if (msg.startsWith('QUOTA_EXHAUSTED:') || /402|quota|allowance/i.test(msg)) {
            void recordRun({ workspaceId: 'local', command: `run ${entry}`, status: 'quota', exitCode: null, durationMs: 0 })
            addConsole('error', formatQuotaMessage())
          } else if (msg.startsWith('REMOTE_UNREACHABLE:')) {
            addConsole(
              'warn',
              'Python/Go need the remote runner (set VITE_RUNTIME_URL to your broker). ' +
                msg.slice('REMOTE_UNREACHABLE:'.length),
            )
          } else {
            addConsole('error', msg.replace(/^RUN_FAILED:/, ''))
          }
          setStatus('error')
        } finally {
          setStage(null)
        }
        return
      }

      try {
        let bundle
        if (canUseRemote(target)) {
          try {
            bundle = await bundleProjectRemote(target)
          } catch (e) {
            if ((e as Error).message.startsWith('BUILD_FAILED:')) throw e
            addConsole('warn', 'Remote runtime unavailable — building in the browser instead.')
            await ensureWasm()
            bundle = await bundleProject(target)
          }
        } else {
          await ensureWasm()
          bundle = await bundleProject(target)
        }
        setProgram(null)
        setSrcDoc(buildSrcdoc(target['index.html'], bundle))
        setRunKey((k) => k + 1)
        setStatus('done')
        setBuildMs(Math.round(performance.now() - t0))
      } catch (e) {
        setSrcDoc('')
        setProgram(null)
        setBuildMs(Math.round(performance.now() - t0))
        for (const err of formatBuildErrors(e)) {
          const file = resolveErrorFile(err.location?.file, target)
          const loc = err.location
            ? ` (line ${err.location.line}${err.location.column ? `:${err.location.column}` : ''})`
            : ''
          addConsole(
            'error',
            file ? `Build error: ${err.message}` : `Build error${loc}: ${err.message}`,
            { file, line: err.location?.line, column: err.location?.column },
          )
        }
        setStatus('error')
      }
    },
    [files, addConsole, clearConsole, ensureWasm],
  )

  return { srcDoc, setSrcDoc, runKey, status, stage, buildMs, program, setProgram, run, cancel }
}
