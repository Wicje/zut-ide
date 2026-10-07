import { describe, expect, it, beforeEach } from 'vitest'
import { estimateSmallHours, LIMITS, formatQuotaMessage } from './limits'
import { clearUsage, pilotStats, recordRun } from './usage'

beforeEach(() => {
  clearUsage()
})

describe('pilot cost controls', () => {
  it('estimates Small-hours (micro 0.5x, small 1x, standard 2x)', () => {
    expect(estimateSmallHours(3600000, 'small')).toBeCloseTo(1)
    expect(estimateSmallHours(3600000, 'micro')).toBeCloseTo(0.5)
    expect(estimateSmallHours(3600000, 'standard')).toBeCloseTo(2)
  })

  it('records runs and reports pilot stats without backend', () => {
    recordRun({ workspaceId: 'w1', command: 'run main.py', status: 'success', exitCode: 0, durationMs: 1200 })
    recordRun({ workspaceId: 'w1', command: 'run main.py', status: 'failed', exitCode: 1, durationMs: 800 })
    const s = pilotStats()
    expect(s.runs).toBe(2)
    expect(s.today).toBe(2)
    expect(s.avgMs).toBeGreaterThan(0)
  })

  it('quota message is plain words, never raw codes', () => {
    const m = formatQuotaMessage()
    expect(m).toMatch(/run time used up/i)
    expect(m).not.toMatch(/402|Small-hours|externalId|Cells/)
  })

  it('caps have sane pilot defaults', () => {
    expect(LIMITS.dailyRunCap).toBeGreaterThan(0)
    expect(LIMITS.maxLiveSessionsPerUser).toBe(1)
    expect(LIMITS.syncBatchMaxFiles).toBe(200)
  })
})
