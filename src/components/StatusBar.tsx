import { CircleAlert, CircleCheck, Loader2, Cloud, HardDrive, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RunStatus } from '../types'

interface StatusBarProps {
  status: RunStatus
  buildMs?: number | null
  saved: boolean
  savedTo: 'cloud' | 'device'
  projectName: string
  fileCount: number
  activeFile: string
  errorCount: number
  cloudBuild: boolean
}

/** VS Code-style status bar: the single glanceable row that says "this is an IDE". */
export default function StatusBar({
  status,
  buildMs,
  saved,
  savedTo,
  projectName,
  fileCount,
  activeFile,
  errorCount,
  cloudBuild,
}: StatusBarProps) {
  return (
    <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-border/60 bg-muted/30 px-3 text-[11px] text-muted-foreground select-none">
      {/* Left: run state */}
      <span
        className={cn(
          'flex items-center gap-1.5 font-medium',
          status === 'error' && 'text-red-400',
          status === 'done' && 'text-emerald-400',
          status === 'running' && 'text-amber-400',
        )}
      >
        {status === 'running' ? (
          <Loader2 className="size-3 animate-spin" />
        ) : status === 'error' ? (
          <CircleAlert className="size-3" />
        ) : status === 'done' ? (
          <CircleCheck className="size-3" />
        ) : (
          <span className="size-1.5 rounded-full bg-muted-foreground/60" />
        )}
        {status === 'idle' ? 'Idle' : status === 'running' ? 'Building' : status === 'done' ? 'Running' : 'Build failed'}
        {buildMs != null && (
          <span className="font-mono font-normal text-muted-foreground">
            {buildMs < 1000 ? `${buildMs}ms` : `${(buildMs / 1000).toFixed(1)}s`}
          </span>
        )}
      </span>

      <span className="h-3 w-px bg-border/70" aria-hidden />

      {/* Project */}
      <span className="flex min-w-0 items-center gap-1.5" title={savedTo === 'cloud' ? 'Saved to your cloud account' : 'Saved on this device only — sign in for cloud save'}>
        <span className={cn('size-1.5 shrink-0 rounded-full', saved ? 'bg-emerald-400/70' : 'bg-amber-400')} />
        <span className="truncate font-medium text-foreground/80">{projectName}</span>
        <span className="hidden sm:inline">{saved ? `saved · ${savedTo}` : 'unsaved'}</span>
      </span>

      <span className="hidden items-center gap-1 md:flex">
        <span className="font-mono">{fileCount} file{fileCount === 1 ? '' : 's'}</span>
      </span>

      {activeFile && (
        <span className="hidden min-w-0 truncate font-mono text-muted-foreground/80 lg:inline">
          {activeFile}
        </span>
      )}

      <span className="ml-auto flex items-center gap-3">
        {/* Console errors */}
        {errorCount > 0 ? (
          <span className="flex items-center gap-1 text-red-400" title="Fix the errors shown in the console">
            <TriangleAlert className="size-3" />
            <span className="font-mono">{errorCount} error{errorCount === 1 ? '' : 's'}</span>
          </span>
        ) : (
          <span className="hidden items-center gap-1 sm:flex">
            <CircleCheck className="size-3 text-muted-foreground/60" />
            <span>No errors</span>
          </span>
        )}

        {/* Build location */}
        <span
          className="flex items-center gap-1"
          title={cloudBuild ? 'Building on zut-cloud (fast on weak devices)' : 'Building in this browser'}
        >
          {cloudBuild ? <Cloud className="size-3 text-emerald-400/80" /> : <HardDrive className="size-3" />}
          <span className="hidden sm:inline">{cloudBuild ? 'cloud build' : 'local build'}</span>
        </span>
      </span>
    </footer>
  )
}
