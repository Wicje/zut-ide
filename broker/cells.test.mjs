import { describe, expect, it } from 'vitest'
import { batchEntries, cleanRelPath, dailyKey, diffFiles, estimateSmallHours, hashFile, safeSeg } from './lib.mjs'
import { CELLS_DEFAULTS, cellsConfig, cellsConfigured, createCellsDriver, planSync } from './cells.mjs'

describe('broker/lib guards', () => {
  it('accepts safe segments only', () => {
    expect(safeSeg('my-proj_1')).toBe('my-proj_1')
    expect(safeSeg('../evil', null)).toBeNull()
    expect(safeSeg('', null)).toBeNull()
  })

  it('rejects unsafe paths', () => {
    expect(cleanRelPath('main.py')).toBe('main.py')
    expect(cleanRelPath('/etc/passwd')).toBeNull()
    expect(cleanRelPath('../x.py')).toBeNull()
    expect(cleanRelPath('a/../../b.py')).toBeNull()
  })

  it('hashes deterministically and diffs by hash', () => {
    expect(hashFile('x')).toBe(hashFile('x'))
    const files = { 'a.py': 'print(1)', 'b.py': 'print(2)', 'index.html': '<h1>x</h1>' }
    const hashes = { 'a.py': hashFile('print(1)') }
    // index.html never syncs; a.py unchanged; b.py new
    expect(diffFiles(files, hashes)).toEqual(['b.py'])
  })

  it('batches at 200', () => {
    const entries = Array.from({ length: 450 }, (_, i) => `f${i}.py`)
    const batches = batchEntries(entries, 200)
    expect(batches.map((b) => b.length)).toEqual([200, 200, 50])
  })

  it('estimates Small-hours like the browser mirror', () => {
    expect(estimateSmallHours(3600000, 'micro')).toBeCloseTo(0.5)
    expect(estimateSmallHours(3600000, 'small')).toBeCloseTo(1)
    expect(dailyKey('u', new Date('2026-10-07T12:00:00Z'))).toBe('u:2026-10-07')
  })
})

describe('cells driver seam', () => {
  it('is off without a key', () => {
    expect(cellsConfigured({})).toBe(false)
    expect(cellsConfigured({ CELLS_API_KEY: 'k' })).toBe(true)
  })

  it('defaults to blueprint paths, overridable per endpoint', () => {
    const cfg = cellsConfig({})
    expect(cfg.baseUrl).toBe(CELLS_DEFAULTS.baseUrl)
    expect(cfg.epExec).toContain('/exec')
    const over = cellsConfig({ CELLS_API_KEY: 'k', CELLS_ENDPOINT_EXEC: 'https://x/run' })
    expect(over.epExec).toBe('https://x/run')
    expect(over.epFiles).toContain('/files')
  })

  it('plans hash-diff sync in batches, skipping web shell', () => {
    const files = { 'main.py': 'print(1)', 'req.txt': 'r', 'index.html': '<h1/>' }
    const batches = planSync(files, { 'main.py': hashFile('print(1)') }, 200)
    expect(batches).toEqual([['req.txt']])
  })

  it('creates a cells driver only when configured', () => {
    expect(createCellsDriver(cellsConfig({ CELLS_API_KEY: 'k' }))).toMatchObject({ kind: 'cells' })
  })
})
