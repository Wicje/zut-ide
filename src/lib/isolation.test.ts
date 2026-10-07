import { describe, expect, it } from 'vitest'
import { batchFiles, canAccessWorkspace, hashFile } from './backend'

describe('workspace isolation (A can never touch B)', () => {
  it('denies cross-user access', () => {
    expect(canAccessWorkspace('user-A', 'user-B')).toBe(false)
    expect(canAccessWorkspace('user-A', 'user-A')).toBe(true)
  })

  it('denies missing/unsafe ids', () => {
    expect(canAccessWorkspace(null, 'user-A')).toBe(false)
    expect(canAccessWorkspace('user-A', null)).toBe(false)
    expect(canAccessWorkspace('../evil', '../evil')).toBe(false)
    expect(canAccessWorkspace('', '')).toBe(false)
  })

  it('hashes files deterministically for diff sync', () => {
    expect(hashFile('hello')).toBe(hashFile('hello'))
    expect(hashFile('hello')).not.toBe(hashFile('world'))
  })

  it('batches file writes at 200 per Cells call', () => {
    const files: Record<string, string> = {}
    for (let i = 0; i < 450; i++) files[`f${i}.txt`] = 'x'
    const batches = batchFiles(files, 200)
    expect(batches.length).toBe(3)
    expect(batches[0] ? Object.keys(batches[0]).length : 0).toBe(200)
    expect(batches[2] ? Object.keys(batches[2]).length : 0).toBe(50)
  })

  it('never sends service keys from the browser (contract)', () => {
    // Browser may hold only VITE_MUDBASE_PROXY_URL / VITE_RUNTIME_URL + user token.
    // Cells API key, Mudbase project key, service_role must be server env only.
    const forbidden = ['VITE_CELLS_API_KEY', 'VITE_MUDBASE_SECRET', 'VITE_SUPABASE_SERVICE_ROLE_KEY']
    for (const k of forbidden) {
      expect((import.meta.env as Record<string, string | undefined>)[k]).toBeUndefined()
    }
  })
})
