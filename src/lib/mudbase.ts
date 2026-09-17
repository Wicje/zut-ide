// Mudbase serverless backend client.
// Deploys and runs single-file JS/TS handlers as serverless functions on Mudbase
// (https://api.mudbase.dev). Configured via .env (VITE_MUDBASE_*). The key and
// project id are compiled into the bundle exactly like the Supabase anon key —
// keep the key scoped and rotate it if it ever leaks.

export const MUDBASE_BASE_URL =
  (import.meta.env.VITE_MUDBASE_BASE_URL as string | undefined) ?? 'https://api.mudbase.dev'
const apiKey = import.meta.env.VITE_MUDBASE_API_KEY as string | undefined
const projectId = import.meta.env.VITE_MUDBASE_PROJECT_ID as string | undefined

/** Least-privilege proxy (see runtime/server.mjs). When set, the browser never
 *  holds the Mudbase key — all calls go through the runtime service. */
const PROXY_URL = (import.meta.env.VITE_MUDBASE_PROXY_URL as string | undefined)?.replace(/\/+$/, '')
const RUNTIME_TOKEN = import.meta.env.VITE_RUNTIME_TOKEN as string | undefined

export function mudbaseProxyEnabled(): boolean {
  return Boolean(PROXY_URL)
}

export function mudbaseEnabled(): boolean {
  return mudbaseProxyEnabled() || Boolean(apiKey && projectId)
}

export function mudbaseProjectId(): string | null {
  return projectId ?? null
}

export function requireMudbaseProjectId(): string {
  if (!projectId) throw new Error('Mudbase is not configured (missing VITE_MUDBASE_PROJECT_ID).')
  return projectId
}

/** Public, unauthenticated endpoint that runs every `webhook`-triggered function
 *  and returns each function's result in the HTTP response. */
export function mudbaseWebhookUrl(): string {
  return `${MUDBASE_BASE_URL}/api/functions/webhook/${requireMudbaseProjectId()}`
}

export interface MudbaseFunctionTrigger {
  type: 'http' | 'event' | 'document' | 'file' | 'webhook' | 'cron' | 'messaging'
  event?: string
  schedule?: string
  path?: string
  method?: string
  collectionId?: string
  bucketId?: string
}

export interface MudbaseFunctionStats {
  totalExecutions?: number
  successfulExecutions?: number
  failedExecutions?: number
  avgExecutionTime?: number
  lastExecution?: string
}

export interface MudbaseFunction {
  _id: string
  name: string
  description?: string
  projectId?: string
  trigger?: MudbaseFunctionTrigger | null
  stats?: MudbaseFunctionStats | null
  isActive?: boolean
  createdAt?: string
  updatedAt?: string
}

export interface MudbaseWebhookResult {
  functionId: string
  success: boolean
  result?: unknown
  error?: string
  executionTime?: number
}

export interface MudbaseExecutionStatus {
  executionId: string
  status: 'queued' | 'provisioning' | 'running' | 'success' | 'failed' | 'timeout'
  durationMs?: number | null
  result?: unknown
  error?: string | null
  errorClass?: string | null
  logs?: { stdout?: string; stderr?: string; truncated?: boolean; bytes?: number } | null
  completedAt?: string | null
}

export interface MudbaseExecutionLog {
  _id?: string
  executedAt?: string
  executionTime?: number
  success?: boolean
  payload?: unknown
  result?: unknown
  error?: string
  triggerType?: string
  triggerEvent?: string
  invokedBy?: string
  retryCount?: number
}

interface ApiError {
  error?: string
  message?: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!apiKey) throw new Error('Mudbase is not configured (missing VITE_MUDBASE_API_KEY).')
  const res = await fetch(`${MUDBASE_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
      ...(init?.headers ?? {}),
    },
  })
  const text = await res.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    /* non-json response */
  }
  if (!res.ok) {
    const err = (json as ApiError | null) ?? {}
    throw new Error(err.error ?? err.message ?? `Mudbase request failed (${res.status})`)
  }
  return json as T
}

/** Same envelope handling through the proxy (which already normalizes). */
async function prequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${PROXY_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(RUNTIME_TOKEN ? { Authorization: `Bearer ${RUNTIME_TOKEN}` } : {}),
      ...(init?.headers ?? {}),
    },
  })
  const text = await res.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    /* non-json response */
  }
  if (!res.ok) {
    const err = (json as ApiError | null) ?? {}
    throw new Error(err.error ?? err.message ?? `Mudbase request failed (${res.status})`)
  }
  return json as T
}

/** Turn a project name / file name into a safe function slug. */
export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'fn'
  )
}

export async function listMudbaseFunctions(): Promise<MudbaseFunction[]> {
  if (mudbaseProxyEnabled()) {
    const res = await prequest<{ functions?: MudbaseFunction[] }>('/functions?limit=100')
    return res.functions ?? []
  }
  const pid = requireMudbaseProjectId()
  // The spec wraps the list in `data`, the live API returns it top-level — accept both.
  const res = await request<{ data?: { functions?: MudbaseFunction[] }; functions?: MudbaseFunction[] }>(
    `/api/functions/projects/${pid}/functions?limit=100`,
  )
  return res.data?.functions ?? res.functions ?? []
}

export interface CreateMudbaseFunctionInput {
  name: string
  description?: string
  code: string
  trigger: MudbaseFunctionTrigger
  environment?: Record<string, string>
}

export async function createMudbaseFunction(input: CreateMudbaseFunctionInput): Promise<MudbaseFunction> {
  if (mudbaseProxyEnabled()) {
    const fn = await prequest<MudbaseFunction>('/functions', {
      method: 'POST',
      body: JSON.stringify(input),
    })
    if (!fn?._id) throw new Error('Mudbase did not return the created function.')
    return fn
  }
  const pid = requireMudbaseProjectId()
  const res = await request<MudbaseFunction & { data?: MudbaseFunction }>(
    `/api/functions/projects/${pid}/functions`,
    { method: 'POST', body: JSON.stringify(input) },
  )
  const fn = res.data ?? res
  if (!fn._id) throw new Error('Mudbase did not return the created function.')
  return fn
}

export async function updateMudbaseFunction(
  functionId: string,
  patch: Partial<CreateMudbaseFunctionInput> & { isActive?: boolean },
): Promise<MudbaseFunction> {
  if (mudbaseProxyEnabled()) {
    const fn = await prequest<MudbaseFunction>(`/functions/${functionId}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    })
    if (!fn?._id) throw new Error('Mudbase did not return the updated function.')
    return fn
  }
  const pid = requireMudbaseProjectId()
  const res = await request<MudbaseFunction & { data?: MudbaseFunction }>(
    `/api/functions/projects/${pid}/functions/${functionId}`,
    { method: 'PUT', body: JSON.stringify(patch) },
  )
  const fn = res.data ?? res
  if (!fn._id) throw new Error('Mudbase did not return the updated function.')
  return fn
}

export async function deleteMudbaseFunction(functionId: string): Promise<void> {
  if (mudbaseProxyEnabled()) {
    await prequest<{ ok?: boolean }>(`/functions/${functionId}`, { method: 'DELETE' })
    return
  }
  const pid = requireMudbaseProjectId()
  await request<{ success?: boolean }>(
    `/api/functions/projects/${pid}/functions/${functionId}`,
    { method: 'DELETE' },
  )
}

export async function setMudbaseFunctionActive(functionId: string, active: boolean): Promise<MudbaseFunction> {
  if (mudbaseProxyEnabled()) {
    const fn = await prequest<MudbaseFunction>(`/functions/${functionId}/${active ? 'activate' : 'deactivate'}`, {
      method: 'POST',
    })
    if (!fn?._id) throw new Error('Mudbase did not return the updated function.')
    return fn
  }
  const pid = requireMudbaseProjectId()
  const res = await request<MudbaseFunction & { data?: MudbaseFunction }>(
    `/api/functions/projects/${pid}/functions/${functionId}/${active ? 'activate' : 'deactivate'}`,
    { method: 'POST' },
  )
  const fn = res.data ?? res
  if (!fn._id) throw new Error('Mudbase did not return the updated function.')
  return fn
}

export async function executeMudbaseFunction(
  functionId: string,
  payload: unknown,
): Promise<{ executionId: string; status: string }> {
  if (mudbaseProxyEnabled()) {
    const res = await prequest<{ executionId?: string; status?: string }>(`/functions/${functionId}/execute`, {
      method: 'POST',
      body: JSON.stringify({ payload }),
    })
    if (!res?.executionId) throw new Error('Mudbase did not return an execution id.')
    return { executionId: res.executionId, status: res.status ?? 'queued' }
  }
  const pid = requireMudbaseProjectId()
  const res = await request<{ data?: { executionId?: string; status?: string }; executionId?: string; status?: string }>(
    `/api/functions/projects/${pid}/functions/${functionId}/execute`,
    { method: 'POST', body: JSON.stringify({ payload }) },
  )
  const data = res.data ?? res
  if (!data.executionId) throw new Error('Mudbase did not return an execution id.')
  return { executionId: data.executionId, status: data.status ?? 'queued' }
}

export async function getMudbaseExecutionStatus(
  functionId: string,
  executionId: string,
): Promise<MudbaseExecutionStatus> {
  if (mudbaseProxyEnabled()) {
    const status = await prequest<MudbaseExecutionStatus>(`/functions/${functionId}/executions/${executionId}`)
    if (!status || typeof status.status !== 'string') throw new Error('Mudbase did not return execution status.')
    return status
  }
  const pid = requireMudbaseProjectId()
  const res = await request<MudbaseExecutionStatus & { data?: MudbaseExecutionStatus }>(
    `/api/functions/projects/${pid}/functions/${functionId}/executions/${executionId}`,
  )
  const status = res.data ?? res
  if (!status || typeof status.status !== 'string') throw new Error('Mudbase did not return execution status.')
  return status
}

/** Poll an execution until it leaves queued/provisioning/running. Returns the last status. */
export async function pollMudbaseExecution(
  functionId: string,
  executionId: string,
  onStatus?: (status: string) => void,
  timeoutMs = 45_000,
  intervalMs = 1_200,
): Promise<MudbaseExecutionStatus> {
  const started = Date.now()
  for (;;) {
    const status = await getMudbaseExecutionStatus(functionId, executionId)
    onStatus?.(status.status)
    if (status.status === 'success' || status.status === 'failed' || status.status === 'timeout') {
      return status
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error(`Execution timed out while ${status.status}. Check the function logs.`)
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}

export async function getMudbaseLogs(
  functionId: string,
  limit = 20,
): Promise<{ executions: MudbaseExecutionLog[]; stats?: MudbaseFunctionStats }> {
  if (mudbaseProxyEnabled()) {
    const res = await prequest<{ executions?: MudbaseExecutionLog[]; stats?: MudbaseFunctionStats }>(
      `/functions/${functionId}/logs?limit=${limit}`,
    )
    return { executions: res.executions ?? [], stats: res.stats }
  }
  const pid = requireMudbaseProjectId()
  const res = await request<{ data?: { executions?: MudbaseExecutionLog[]; stats?: MudbaseFunctionStats }; executions?: MudbaseExecutionLog[]; stats?: MudbaseFunctionStats }>(
    `/api/functions/projects/${pid}/functions/${functionId}/logs?limit=${limit}`,
  )
  const data = res.data ?? res
  return { executions: data.executions ?? [], stats: data.stats }
}

/** POST to the public webhook endpoint — synchronous response with each function's result. */
export async function invokeMudbaseWebhook(
  body: unknown,
): Promise<{ triggered: number; results: MudbaseWebhookResult[] }> {
  if (mudbaseProxyEnabled()) {
    const res = await prequest<{ triggered?: number; results?: MudbaseWebhookResult[] }>('/webhook', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    return { triggered: res.triggered ?? 0, results: res.results ?? [] }
  }
  const res = await fetch(mudbaseWebhookUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(apiKey ? { 'X-API-Key': apiKey } : {}) },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    /* non-json response */
  }
  if (!res.ok) {
    const err = (json as ApiError | null) ?? {}
    throw new Error(err.error ?? err.message ?? `Webhook trigger failed (${res.status})`)
  }
  const data = json as { triggered?: number; results?: MudbaseWebhookResult[] }
  return { triggered: data.triggered ?? 0, results: data.results ?? [] }
}