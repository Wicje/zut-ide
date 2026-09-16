// Vercel project + deployment helpers (direct file upload, no git needed).

const API = 'https://api.vercel.com'

async function vercel(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...((init.headers as Record<string, string>) ?? {}),
    },
  })
  return res
}

export async function vercelUser(token: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}/v2/user`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Vercel error (${res.status})`)
  const data = (await res.json()) as { user?: Record<string, unknown> }
  return data.user ?? {}
}

function toBase64(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(bin)
}

function projectSettings(files: Record<string, string>) {
  const pkgRaw = files['package.json']
  if (pkgRaw) {
    try {
      const pkg = JSON.parse(pkgRaw) as {
        dependencies?: Record<string, string>
        devDependencies?: Record<string, string>
        scripts?: Record<string, string>
      }
      const deps = { ...pkg.dependencies, ...pkg.devDependencies }
      if (deps.next) {
        return {
          framework: 'nextjs',
          installCommand: 'npm install',
          buildCommand: 'npm run build',
        }
      }
      if (deps.vite) {
        return {
          framework: 'vite',
          installCommand: 'npm install',
          buildCommand: 'npm run build',
          outputDirectory: 'dist',
        }
      }
      if (pkg.scripts?.build) {
        return {
          framework: null,
          installCommand: 'npm install',
          buildCommand: pkg.scripts.build,
          outputDirectory: 'dist',
        }
      }
    } catch {
      /* invalid package.json — treat as static */
    }
  }
  return { framework: null }
}

export interface VercelDeployResult {
  url: string
  deploymentId?: string
  projectName: string
}

const MAX_TOTAL_BYTES = 1_000_000

export async function deployFiles(
  token: string,
  name: string,
  files: Record<string, string>,
): Promise<VercelDeployResult> {
  let totalBytes = 0
  const entries = Object.entries(files).map(([file, data]) => {
    totalBytes += data.length
    return { file, data: toBase64(data), encoding: 'base64' as const }
  })
  if (totalBytes > MAX_TOTAL_BYTES) {
    throw new Error(`Project is too large to deploy inline (${Math.round(totalBytes / 1_000_000)} MB).`)
  }

  const body = {
    name,
    files: entries,
    projectSettings: projectSettings(files),
    target: 'production',
  }

  const res = await vercel(token, '/v13/deployments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await res.json()) as {
    id?: string
    url?: string
    name?: string
    error?: { message?: string; code?: string }
  }
  if (!res.ok) {
    const e = data.error
    throw new Error(e?.message ?? e?.code ?? `Vercel deploy failed (${res.status})`)
  }

  return {
    url: `https://${data.url}`,
    deploymentId: data.id,
    projectName: data.name ?? name,
  }
}