// Single source of truth for broker guardrails + pilot costs.
// The broker enforces these server-side; the browser mirrors them for honest UI.

export const LIMITS = {
  /** Max parallel live sessions per user (Cells caps concurrent sessions plan-wide). */
  maxLiveSessionsPerUser: 1,
  /** Max session wall-clock before broker stops it (ms). */
  maxSessionMs: 2 * 60 * 60 * 1000,
  /** Daily run cap per user (payer decides; pilot default). */
  dailyRunCap: 50,
  /** Monthly agent turns (kept from cloud env). */
  monthlyAgentCap: 50,
  /** Rate limits (per min). */
  rateBuildPerMin: 30,
  rateRunPerMin: 20,
  rateAgentPerMin: 10,
  /** Workspace / file caps. */
  workspaceMaxMb: 50,
  perFileMaxKb: 512,
  runTimeoutMs: 8000,
  runMaxOutputBytes: 256 * 1024,
  stdinMaxBytes: 64 * 1024,
  /** File sync: hash diff, batched writes. */
  syncBatchMaxFiles: 200,
  /** Cold-start UX: show staged UI after this long, offer cancel after this. */
  stageAfterMs: 1200,
  cancelAfterMs: 8000,
  /** Cold-start hard limit for the browser wait (broker may run longer). */
  browserWaitMaxMs: 60000,
} as const

/** Rough client-side Small-hours estimate for display only.
 *  Server bills exact from Cells usage endpoint.
 *  micro ~= 0.5x, small = 1x, standard = 2x. Default small. */
export function estimateSmallHours(durationMs: number, size: 'micro' | 'small' | 'standard' = 'small'): number {
  const factor = size === 'micro' ? 0.5 : size === 'standard' ? 2 : 1
  return (durationMs / 3600000) * factor
}

export function formatQuotaMessage(): string {
  return 'Run time used up for today — try again tomorrow or ask for a higher quota.'
}
