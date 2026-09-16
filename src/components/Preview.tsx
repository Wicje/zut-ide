import { Badge } from '@/components/ui/badge'
import { Smartphone, Tablet, Monitor, Loader2, CircleAlert, CircleCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RunStatus } from '../types'

interface PreviewProps {
  srcDoc: string
  runKey: number
  status: RunStatus
  viewport?: 'auto' | number
  onViewportChange?: (v: 'auto' | number) => void
  showViewportControls?: boolean
}

const STATUS_LABEL: Record<RunStatus, string> = {
  idle: 'Not run yet',
  running: 'Building…',
  done: 'Running',
  error: 'Build failed',
}

const STATUS_STYLE: Record<RunStatus, { badge: string; dot?: string }> = {
  idle: { badge: 'border-border text-muted-foreground' },
  running: { badge: 'border-amber-500/40 text-amber-400' },
  done: { badge: 'border-emerald-500/40 text-emerald-400' },
  error: { badge: 'border-red-500/40 text-red-400' },
}

const VIEWPORTS = [
  { label: '375', width: 375, icon: Smartphone },
  { label: '768', width: 768, icon: Tablet },
  { label: 'All', width: 'auto' as const, icon: Monitor },
] as const

export default function Preview({
  srcDoc,
  runKey,
  status,
  viewport = 'auto',
  onViewportChange,
  showViewportControls,
}: PreviewProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-muted/30 px-3">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Result
        </span>
        <div className="flex items-center gap-2">
          {showViewportControls && onViewportChange && (
            <div className="flex items-center gap-0.5 rounded-md border bg-background p-0.5">
              {VIEWPORTS.map((vp) => {
                const Icon = vp.icon
                const active = viewport === vp.width
                return (
                  <button
                    key={vp.label}
                    className={cn(
                      'flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors',
                      active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground',
                    )}
                    onClick={() => onViewportChange(vp.width)}
                    title={`${vp.label === 'All' ? 'Full width' : vp.label + 'px'}`}
                  >
                    <Icon className="size-3.5" />
                    <span>{vp.label === 'All' ? 'Full' : vp.label}</span>
                  </button>
                )
              })}
            </div>
          )}
          <Badge variant="outline" className={cn('gap-1.5 font-normal', STATUS_STYLE[status].badge)}>
            {status === 'running' ? (
              <Loader2 className="size-3 animate-spin" />
            ) : status === 'error' ? (
              <CircleAlert className="size-3" />
            ) : status === 'done' ? (
              <CircleCheck className="size-3" />
            ) : null}
            {STATUS_LABEL[status]}
          </Badge>
        </div>
      </div>

      <div className="min-h-0 flex-1 p-0">
        {srcDoc ? (
          <div
            className="h-full"
            style={viewport !== 'auto' ? { maxWidth: viewport, margin: '0 auto' } : undefined}
          >
            <iframe
              key={runKey}
              title="preview"
              srcDoc={srcDoc}
              sandbox="allow-scripts allow-forms allow-modals allow-popups"
              className="h-full w-full border-0 bg-white"
              style={viewport !== 'auto' ? { maxWidth: '100%' } : undefined}
            />
          </div>
        ) : (
          <div className="grid h-full place-content-center px-6 text-center text-sm text-muted-foreground">
            <Monitor className="mx-auto mb-3 size-10 opacity-40" />
            Click Run to see your page here.
          </div>
        )}
      </div>
    </div>
  )
}