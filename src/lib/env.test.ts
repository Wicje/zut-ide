import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Server secrets must never be read through a VITE_* variable: Vite inlines
// those into the browser bundle. This guards the contract that used to live in
// the deleted `backend.ts` helpers, and keeps `.env.example` honest.
const HERE = path.dirname(fileURLToPath(import.meta.url))
const SRC = path.resolve(HERE, '..')
const ROOT = path.resolve(SRC, '..')
const FORBIDDEN = [
  'VITE_CELLS_API_KEY',
  'VITE_MUDBASE_SECRET',
  'VITE_MUDBASE_API_KEY',
  'VITE_SUPABASE_SERVICE_ROLE_KEY',
]

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) out.push(...walk(full))
    else if (/\.(ts|tsx)$/.test(full)) out.push(full)
  }
  return out
}

describe('browser secret hygiene', () => {
  it('never reads server-only keys from VITE_* env vars', () => {
    const offenders: string[] = []
    for (const file of walk(SRC)) {
      if (file === path.join(HERE, 'env.test.ts')) continue
      const text = readFileSync(file, 'utf8')
      for (const key of FORBIDDEN) {
        if (text.includes(key)) offenders.push(`${path.relative(ROOT, file)}: ${key}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('keeps the example env free of secret VITE_* vars', () => {
    const example = readFileSync(path.join(ROOT, '.env.example'), 'utf8')
    for (const key of FORBIDDEN) expect(example).not.toContain(key)
  })

  it('resolves the canonical broker URL then the legacy alias', async () => {
    const { resolveBrokerUrl } = await import('./brokerUrl')
    expect(resolveBrokerUrl({ VITE_BROKER_URL: 'https://b.example' })).toBe('https://b.example')
    expect(resolveBrokerUrl({ VITE_RUNTIME_URL: 'https://r.example/' })).toBe('https://r.example')
  })
})
