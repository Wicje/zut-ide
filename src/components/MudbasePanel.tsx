import { useEffect, useMemo, useState } from 'react'
import type { FileMap } from '../types'
import type { ConsoleLevel } from '../types'
import {
  createMudbaseFunction,
  deleteMudbaseFunction,
  executeMudbaseFunction,
  getMudbaseLogs,
  invokeMudbaseWebhook,
  listMudbaseFunctions,
  mudbaseEnabled,
  mudbaseWebhookUrl,
  pollMudbaseExecution,
  setMudbaseFunctionActive,
  slugify,
  updateMudbaseFunction,
  type MudbaseExecutionLog,
  type MudbaseFunction,
  type MudbaseFunctionStats,
  type MudbaseWebhookResult,
} from '../lib/mudbase'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Loader2,
  Play,
  RefreshCw,
  Server,
  Terminal,
  Trash2,
  XCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface MudbasePanelProps {
  files: FileMap
  projectName: string
  onLog: (level: ConsoleLevel, message: string) => void
  onClose?: () => void
}

interface TestOutcome {
  kind: 'webhook' | 'sandbox'
  success: boolean
  durationMs?: number
  result?: unknown
  error?: string
  stdout?: string
  stderr?: string
  status?: string
  triggered?: number
}

const STANDARD_PAYLOAD = `{
  "event": "ping",
  "message": "hello from zut"
}`

function isHandlerFile(path: string): boolean {
  const base = (path.split('/').pop() ?? path).replace(/\.(ts|tsx|js|jsx|mjs)$/i, '')
  const known = ['server', 'api', 'main', 'index', 'handler', 'function', 'lambda', 'webhook']
  if (known.includes(base.toLowerCase())) return true
  return path.startsWith('functions/') || path.includes('/functions/') || path.startsWith('api/')
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function StatsLine({ stats }: { stats?: MudbaseFunctionStats | null }) {
  if (!stats) return
  const total = stats.totalExecutions ?? 0
  const ok = stats.successfulExecutions ?? 0
  const rate = total > 0 ? Math.round((ok / total) * 100) : 0
  return (
    <span className="text-xs text-muted-foreground">
      {total} run{total === 1 ? '' : 's'}
      {total > 0 && <> · {rate}% ok</>}
      {typeof stats.avgExecutionTime === 'number' && <> · ~{stats.avgExecutionTime}ms</>}
    </span>
  )
}

function OutcomeBlock({ outcome }: { outcome: TestOutcome | null }) {
  if (!outcome) return null
  return (
    <div className="grid gap-2 rounded-lg border bg-muted/40 p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {outcome.success ? (
          <CheckCircle2 className="size-4 text-emerald-400" />
        ) : (
          <XCircle className="size-4 text-red-400" />
        )}
        <span className={cn('font-medium', outcome.success ? 'text-emerald-400' : 'text-red-400')}>
          {outcome.success ? 'Succeeded' : 'Failed'}
        </span>
        {outcome.durationMs != null && (
          <span className="text-muted-foreground">({outcome.durationMs}ms)</span>
        )}
        {outcome.status && <Badge variant="outline">{outcome.status}</Badge>}
        {outcome.kind === 'webhook' && outcome.triggered != null && (
          <span className="text-xs text-muted-foreground">
            {outcome.triggered} matching function{outcome.triggered === 1 ? '' : 's'} triggered
          </span>
        )}
      </div>
      {outcome.stdout && (
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-black/80 p-2 font-mono text-xs text-emerald-300">
          {outcome.stdout}
        </pre>
      )}
      {outcome.stderr && (
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-black/80 p-2 font-mono text-xs text-red-300">
          {outcome.stderr}
        </pre>
      )}
      {outcome.error && (
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-red-950/40 p-2 font-mono text-xs text-red-300">
          {outcome.error}
        </pre>
      )}
      {outcome.result !== undefined && outcome.result !== null && (
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-black/80 p-2 font-mono text-xs text-zinc-100">
          {formatValue(outcome.result)}
        </pre>
      )}
    </div>
  )
}

export default function MudbasePanel({ files, projectName, onLog }: MudbasePanelProps) {
  const [fnList, setFnList] = useState<MudbaseFunction[] | null>(null)
  const [fnListError, setFnListError] = useState<string | null>(null)
  const [listBusy, setListBusy] = useState(false)
  const [deployBusy, setDeployBusy] = useState(false)
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [deployError, setDeployError] = useState<string | null>(null)
  const [sourceFile, setSourceFile] = useState('')
  const [fnName, setFnName] = useState(slugify(projectName || 'my-api'))
  const [description, setDescription] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [payload, setPayload] = useState(STANDARD_PAYLOAD)
  const [testBusy, setTestBusy] = useState<null | 'webhook' | 'sandbox'>(null)
  const [outcome, setOutcome] = useState<TestOutcome | null>(null)
  const [logs, setLogs] = useState<MudbaseExecutionLog[] | null>(null)
  const [logsBusy, setLogsBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const candidates = useMemo(
    () =>
      Object.keys(files)
        .filter(isHandlerFile)
        .sort((a, b) => {
          const rank = (p: string) => (p === 'server.js' ? 0 : p === 'server.ts' ? 1 : p === 'api.js' ? 2 : p === 'api.ts' ? 3 : 10)
          return rank(a) - rank(b)
        }),
    [files],
  )

  useEffect(() => {
    if (!mudbaseEnabled() || fnList) return
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!expandedId) return
    loadLogs(expandedId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedId])

  async function refresh() {
    setListBusy(true)
    setFnListError(null)
    try {
      setFnList(await listMudbaseFunctions())
    } catch (e) {
      const msg = (e as { message?: string }).message ?? 'Failed to list functions'
      setFnListError(msg)
      onLog('error', `Mudbase: ${msg}`)
    } finally {
      setListBusy(false)
    }
  }

  function copyEndpoint() {
    navigator.clipboard
      .writeText(mudbaseWebhookUrl())
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => {
        /* clipboard unavailable */
      })
  }

  async function handleDeploy() {
    if (!sourceFile) {
      setDeployError('Pick a handler file to deploy.')
      return
    }
    const slug = slugify(fnName)
    if (!slug) {
      setDeployError('Enter a function name.')
      return
    }
    setDeployBusy(true)
    setDeployError(null)
    try {
      const code = files[sourceFile] ?? ''
      const trigger = { type: 'webhook' as const, event: 'received' }
      const existing = (fnList ?? []).find((f) => f.name === slug)
      let deployed: MudbaseFunction
      if (existing) {
        deployed = await updateMudbaseFunction(existing._id, { code, trigger, description })
        onLog('info', `Mudbase: updated ${existing.name}`)
      } else {
        deployed = await createMudbaseFunction({ name: slug, code, trigger, description })
        onLog('info', `Mudbase: deployed ${slug}`)
      }
      setExpandedId(deployed._id)
      setOutcome(null)
      await refresh()
    } catch (e) {
      const msg = (e as { message?: string }).message ?? 'Deploy failed'
      setDeployError(msg)
      onLog('error', `Mudbase: ${msg}`)
    } finally {
      setDeployBusy(false)
    }
  }

  async function toggleActive(fn: MudbaseFunction) {
    setActionBusy(`active-${fn._id}`)
    try {
      await setMudbaseFunctionActive(fn._id, !fn.isActive)
      await refresh()
    } catch (e) {
      onLog('error', `Mudbase: ${(e as { message?: string }).message}`)
    } finally {
      setActionBusy(null)
    }
  }

  async function handleDelete(fn: MudbaseFunction) {
    if (!window.confirm(`Delete the serverless function "${fn.name}"?`)) return
    setActionBusy(`delete-${fn._id}`)
    try {
      await deleteMudbaseFunction(fn._id)
      if (expandedId === fn._id) setExpandedId(null)
      await refresh()
    } catch (e) {
      onLog('error', `Mudbase: ${(e as { message?: string }).message}`)
    } finally {
      setActionBusy(null)
    }
  }

  function parsePayload(): Record<string, unknown> {
    try {
      const parsed = JSON.parse(payload)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('payload must be a JSON object')
      }
      return parsed as Record<string, unknown>
    } catch (e) {
      throw new Error(`Payload is not valid JSON: ${(e as Error).message}`)
    }
  }

  async function handleWebhookTest(fn: MudbaseFunction) {
    setTestBusy('webhook')
    setOutcome(null)
    try {
      const body = parsePayload()
      const res = await invokeMudbaseWebhook(body)
      const mine = res.results.find((r: MudbaseWebhookResult) => r.functionId === fn._id)
      setOutcome({
        kind: 'webhook',
        success: mine ? mine.success : res.triggered > 0,
        durationMs: mine?.executionTime,
        result: mine?.result,
        error: mine?.error,
        triggered: res.triggered,
      })
      onLog('info', `Mudbase: sent payload to ${fn.name}`)
    } catch (e) {
      setOutcome({ kind: 'webhook', success: false, error: (e as { message?: string }).message })
      onLog('error', `Mudbase: ${(e as { message?: string }).message}`)
    } finally {
      setTestBusy(null)
    }
  }

  async function handleSandboxRun(fn: MudbaseFunction) {
    setTestBusy('sandbox')
    setOutcome(null)
    try {
      const body = parsePayload()
      const { executionId } = await executeMudbaseFunction(fn._id, body)
      const status = await pollMudbaseExecution(fn._id, executionId, (s) => {
        setOutcome({
          kind: 'sandbox',
          success: false,
          status: s,
          error: s === 'success' ? undefined : undefined,
        })
      })
      setOutcome({
        kind: 'sandbox',
        success: status.status === 'success',
        status: status.status,
        durationMs: status.durationMs ?? undefined,
        result: status.result,
        error: status.error ?? undefined,
        stdout: status.logs?.stdout ?? undefined,
        stderr: status.logs?.stderr ?? undefined,
      })
      onLog('info', `Mudbase: ran ${fn.name} in the sandbox (${status.status})`)
    } catch (e) {
      setOutcome({ kind: 'sandbox', success: false, error: (e as { message?: string }).message })
      onLog('error', `Mudbase: ${(e as { message?: string }).message}`)
    } finally {
      setTestBusy(null)
    }
  }

  async function loadLogs(functionId: string) {
    setLogsBusy(true)
    try {
      const res = await getMudbaseLogs(functionId)
      setLogs(res.executions)
    } catch (e) {
      onLog('error', `Mudbase: ${(e as { message?: string }).message}`)
    } finally {
      setLogsBusy(false)
    }
  }

  if (!mudbaseEnabled()) {
    return (
      <div className="grid gap-3">
        <Alert className="py-2">
          <AlertDescription className="text-xs">
            Configure <code className="rounded bg-muted px-1 font-mono">VITE_MUDBASE_API_KEY</code> and{' '}
            <code className="rounded bg-muted px-1 font-mono">VITE_MUDBASE_PROJECT_ID</code> in{' '}
            <code className="rounded bg-muted px-1 font-mono">.env</code> (see README.md) to deploy
            serverless functions with a live, linkable endpoint.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2">
        <Server className="size-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Mudbase serverless API</span>
        <Badge className="gap-1.5 font-normal text-emerald-400" variant="outline">
          <span className="size-1.5 rounded-full bg-emerald-400" /> live
        </Badge>
        <Button variant="ghost" size="icon-sm" className="ml-auto size-6" onClick={refresh} disabled={listBusy} title="Refresh functions">
          <RefreshCw className={cn('size-3.5', listBusy && 'animate-spin')} />
        </Button>
      </div>

      <div className="grid gap-2 rounded-lg border p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Your live endpoint
          </span>
          <Badge variant="outline" className="font-normal text-muted-foreground">
            public · no auth
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Input
            readOnly
            value={mudbaseWebhookUrl()}
            onFocus={(e) => e.currentTarget.select()}
            className="font-mono text-xs"
          />
          <Button onClick={copyEndpoint} variant="outline" size="sm" className="shrink-0 gap-1.5">
            {copied ? <CheckCircle2 className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
            {copied ? 'Copied!' : 'Copy'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          POST JSON to this URL from any static page (or curl) and it runs your deployed functions,
          returning each one's result. No account, key, or CORS config needed.
        </p>
      </div>

      <div className="grid gap-3 rounded-lg border p-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Deploy a function
        </span>
        <div className="grid gap-2">
          <Label htmlFor="mf-source">Handler file</Label>
          <div className="flex flex-wrap gap-2">
            <select
              id="mf-source"
              value={sourceFile}
              onChange={(e) => {
                setSourceFile(e.target.value)
                if (e.target.value && !fnName.trim()) {
                  setFnName(slugify(`${projectName}-${e.target.value}`))
                }
              }}
              className="h-9 flex-1 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 min-w-40"
            >
              <option value="">Select a file…</option>
              {candidates.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            {!candidates.length && <Badge variant="outline" className="text-muted-foreground">no handler file</Badge>}
          </div>
          {!candidates.length && (
            <p className="text-xs text-muted-foreground">
              Add a file named <code className="rounded bg-muted px-1">server.js</code> or{' '}
              <code className="rounded bg-muted px-1">api.js</code> that exports a default function:{' '}
              <code className="rounded bg-muted px-1">export default async function handler(payload, context, env) {'{'} return {'{'}…{'}'} {'}'}</code>
            </p>
          )}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="mf-name">Function name (slug)</Label>
          <Input
            id="mf-name"
            value={fnName}
            onChange={(e) => setFnName(e.target.value)}
            placeholder="my-api"
            className="font-mono text-sm"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="mf-desc">Description</Label>
          <Input
            id="mf-desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional"
          />
        </div>
        <Button className="w-fit" onClick={handleDeploy} disabled={deployBusy || !sourceFile || !slugify(fnName)}>
          {deployBusy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Server className="mr-2 size-4" />}
          {fnList?.some((f) => f.name === slugify(fnName)) ? 'Update function' : 'Deploy function'}
        </Button>
        {deployError && (
          <Alert variant="destructive" className="py-2">
            <AlertDescription className="text-xs">{deployError}</AlertDescription>
          </Alert>
        )}
      </div>

      <div className="grid gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Deployed functions
        </span>
        {fnListError && (
          <Alert variant="destructive" className="py-2">
            <AlertDescription className="text-xs">{fnListError}</AlertDescription>
          </Alert>
        )}
        {fnList === null && listBusy && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Loading functions…
          </div>
        )}
        {fnList !== null && fnList.length === 0 && (
          <p className="text-xs text-muted-foreground">No functions deployed yet.</p>
        )}
        {fnList?.map((fn) => {
          const expanded = expandedId === fn._id
          const running = actionBusy === `active-${fn._id}` || actionBusy === `delete-${fn._id}`
          return (
            <div key={fn._id} className="grid gap-2 rounded-lg border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="grid gap-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{fn.name}</span>
                    <Badge variant="outline" className="font-mono text-[10px] text-muted-foreground">
                      {fn.trigger?.type ?? '?'}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={cn('font-normal', fn.isActive === false ? 'text-muted-foreground' : 'text-emerald-400')}
                    >
                      {fn.isActive === false ? 'paused' : 'active'}
                    </Badge>
                  </div>
                  <StatsLine stats={fn.stats} />
                  {fn.description && <span className="text-xs text-muted-foreground">{fn.description}</span>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => {
                      setExpandedId(expanded ? null : fn._id)
                      setOutcome(null)
                    }}
                  >
                    {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                    Test
                  </Button>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    title={fn.isActive === false ? 'Activate' : 'Pause'}
                    disabled={running}
                    onClick={() => toggleActive(fn)}
                  >
                    {running && actionBusy === `active-${fn._id}` ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Activity className="size-3.5" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    title="Delete"
                    className="text-muted-foreground hover:text-red-400"
                    disabled={running}
                    onClick={() => handleDelete(fn)}
                  >
                    {running && actionBusy === `delete-${fn._id}` ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                  </Button>
                </div>
              </div>

              {expanded && (
                <div className="grid gap-2 border-t pt-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor={`payload-${fn._id}`}>JSON payload</Label>
                    <Textarea
                      id={`payload-${fn._id}`}
                      className="min-h-24 font-mono text-xs"
                      value={payload}
                      onChange={(e) => setPayload(e.target.value)}
                      spellCheck={false}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      disabled={testBusy !== null}
                      onClick={() => void handleWebhookTest(fn)}
                    >
                      {testBusy === 'webhook' ? (
                        <Loader2 className="mr-2 size-3.5 animate-spin" />
                      ) : (
                        <Play className="mr-2 size-3.5" />
                      )}
                      Send request
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={testBusy !== null}
                      onClick={() => void handleSandboxRun(fn)}
                    >
                      {testBusy === 'sandbox' ? (
                        <Loader2 className="mr-2 size-3.5 animate-spin" />
                      ) : (
                        <Terminal className="mr-2 size-3.5" />
                      )}
                      Run in sandbox
                    </Button>
                    <span className="text-[11px] text-muted-foreground">
                      “Send request” hits your public URL; “sandbox” streams logs & console output.
                    </span>
                  </div>
                  <OutcomeBlock outcome={outcome} />
                  <div className="flex items-center gap-2 pt-1">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Recent executions
                    </span>
                    <Button variant="ghost" size="icon-sm" className="size-5" onClick={() => loadLogs(fn._id)} title="Reload logs">
                      <RefreshCw className={cn('size-3', logsBusy && 'animate-spin')} />
                    </Button>
                  </div>
                  {logsBusy ? (
                    <p className="text-xs text-muted-foreground">Loading logs…</p>
                  ) : logs && logs.length > 0 ? (
                    <ScrollArea className="max-h-40 rounded-lg border">
                      <div className="grid gap-1.5 p-2">
                        {logs.map((l, i) => (
                          <div key={l._id ?? i} className="grid gap-0.5 rounded border bg-muted/30 p-2">
                            <div className="flex flex-wrap items-center gap-2 text-xs">
                              <span className={cn('font-medium', l.success === false ? 'text-red-400' : 'text-emerald-400')}>
                                {l.success === false ? 'failed' : 'ok'}
                              </span>
                              <span className="text-muted-foreground">{l.executedAt ?? '—'}</span>
                              {typeof l.executionTime === 'number' && (
                                <span className="text-muted-foreground">{l.executionTime}ms</span>
                              )}
                              {l.invokedBy && <Badge variant="outline" className="font-mono text-[10px]">{l.invokedBy}</Badge>}
                            </div>
                            {l.error && <pre className="whitespace-pre-wrap font-mono text-xs text-red-300">{l.error}</pre>}
                            {l.result != null && (
                              <pre className="whitespace-pre-wrap font-mono text-xs text-zinc-200">
                                {formatValue(l.result)}
                              </pre>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  ) : (
                    <p className="text-xs text-muted-foreground">No executions recorded yet.</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}