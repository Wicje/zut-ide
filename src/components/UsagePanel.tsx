import { Activity, AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { LIMITS } from '../lib/limits'
import { listRecentRuns, pilotStats } from '../lib/usage'
import { cn } from '@/lib/utils'

// Pilot cost dashboard: runs, estimated Small-hours, quota state.
// Broker is source of truth in BaaS; this mirrors local runs so the pilot
// works offline. Numbers are estimates — server bills exact.
export default function UsagePanel() {
  const s = pilotStats()
  const quotaHit = s.today >= LIMITS.dailyRunCap
  const recent = listRecentRuns(10)

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-2">
        <Activity className="size-4 text-muted-foreground" />
        <span className="text-sm font-semibold">Run time (pilot)</span>
        <Badge variant="outline" className={cn('font-normal', quotaHit ? 'text-red-400' : 'text-emerald-400')}>
          {s.today}/{LIMITS.dailyRunCap} today
        </Badge>
      </div>
      {quotaHit && (
        <p className="flex items-center gap-1.5 text-xs text-red-400">
          <AlertTriangle className="size-3.5" /> Run time used up for today — try again tomorrow or ask for a higher quota.
        </p>
      )}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg border p-2">
          <div className="font-mono text-lg">{s.runs}</div>
          <div className="text-[11px] text-muted-foreground">runs</div>
        </div>
        <div className="rounded-lg border p-2">
          <div className="font-mono text-lg">{s.smallHours.toFixed(2)}</div>
          <div className="text-[11px] text-muted-foreground">Small-h (est)</div>
        </div>
        <div className="rounded-lg border p-2">
          <div className="font-mono text-lg">{s.avgMs}ms</div>
          <div className="text-[11px] text-muted-foreground">avg/run</div>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Editing is free — only runs use run time. Server bills exact from Cells usage; this is a local estimate.
      </p>
      {recent.length > 0 && (
        <div className="grid gap-1.5">
          {recent.map((r, i) => (
            <div key={`${r.at}-${i}`} className="flex items-center gap-2 rounded border bg-muted/30 px-2 py-1 font-mono text-[11px]">
              <span className={cn(r.status === 'success' ? 'text-emerald-400' : r.status === 'quota' ? 'text-red-400' : 'text-amber-400')}>
                {r.status}
              </span>
              <span className="truncate text-muted-foreground">{r.command}</span>
              <span className="ml-auto text-muted-foreground">{r.durationMs}ms</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
