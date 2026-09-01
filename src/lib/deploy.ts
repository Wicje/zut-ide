import JSZip from 'jszip'
import type { FileMap } from '../types'

export interface DeployResult {
  url: string
  siteId: string
}

export async function deployToNetlify(
  _name: string,
  files: FileMap,
): Promise<DeployResult> {
  const zip = new JSZip()
  for (const [path, content] of Object.entries(files)) {
    zip.file(path, content)
  }
  const blob = await zip.generateAsync({ type: 'blob' })

  const res = await fetch('https://api.netlify.com/api/v1/sites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/zip' },
    body: blob,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message ?? `Deploy failed (${res.status})`)
  }

  const data = await res.json()
  return { url: data.ssl_url ?? data.url, siteId: data.id }
}
