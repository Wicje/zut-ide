import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Play, Terminal } from 'lucide-react'
import { cn } from '@/lib/utils'
import Preview from './Preview'
import type { ProgramResult, RunStage, RunStatus } from '../types'
import type { ProjectKind } from '../lib/projectKind'
import { KIND_LABEL } from '../lib/projectKind'

export const STAGE_LABEL: Record<RunStage, string> = {
  waking: 'Waking remote computer…',
  installing: 'Installing…',
  starting: 'Starting…',
  running: 'Running…',
  ready: 'Ready',
}

interface RunOutputProps {
  kind: ProjectKind
  srcDoc: string
  runKey: number
  status: RunStatus
  stage?: RunStage | null
  program: ProgramResult | null
  previewUrl?: string | null
  previewAccess?: 'private-token' | 'public' | null
  viewport?: 'auto' | number
  onViewportChange?: (v: 'auto' | number) => void
  showViewportControls?: boolean
  onRun: () => void
  onRunProgram: (stdin: string) => void
  onCancel?: () => void
}

/** Unified output for web + programs. Same component on mobile and desktop:
 *  - web -> sandboxed iframe preview (existing behavior)
 *  - python/go -> terminal output (stdout/stderr + exit code + stdin)
 *  AI is never involved: plain code + Run.
 */
export default function RunOutput({
  kind,
  srcDoc,
  runKey,
  status,
  stage,
  program,
  previewUrl,
  previewAccess,
  viewport,
  onViewportChange,
  showViewportControls,
  onRun,
  onRunProgram,
  onCancel,
}: RunOutputProps) {
  const [stdin, setStdin] = useState('')

  if (kind === 'web') {
    return (
      <Preview
        srcDoc={srcDoc}
        runKey={runKey}
        status={status}
        stage={stage}
        previewUrl={previewUrl}
        previewAccess={previewAccess}
        viewport={viewport}
        onViewportChange={onViewportChange}
        showViewportControls={showViewportControls}
        onRun={onRun}
        onCancel={onCancel}
      />
    )
  }

  const hasOutput = Boolean(program && (program.stdout || program.stderr))
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-muted/30 px-3">
        <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
          <Terminal className="size-3.5" /> Output
          <span className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] normal-case tracking-normal">
            {KIND_LABEL[kind]}
          </span>
        </span>
        <span
          className={cn(
            'rounded-full border px-2 py-0.5 font-mono text-[10px]',
            status === 'done'
              ? 'border-emerald-500/40 text-emerald-400'
              : status === 'error'
                ? 'border-red-500/40 text-red-400'
                : status === 'running'
                  ? 'border-amber-500/40 text-amber-400'
                  : 'border-border text-muted-foreground',
          )}
        >
          {status === 'running'
            ? (stage ? STAGE_LABEL[stage] : 'Running…')
            : program
              ? `exit ${program.exitCode ?? '?'} · ${program.durationMs}ms`
              : status === 'error'
                ? 'Failed'
                : 'Not run yet'}
        </span>
        {status === 'running' && onCancel && (
          <button
            onClick={onCancel}
            className="rounded border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground hover:text-foreground"
            title="Stop this run (no further run time will be used)"
          >
            Cancel
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-muted/40 p-3 font-mono text-[12px] leading-5">
        {!hasOutput && status !== 'running' && (
          <div className="grid h-full place-content-center gap-3 text-center">
            <p className="text-sm text-muted-foreground">
              {status === 'error'
                ? 'The last run failed — check the console.'
                : `Press Run to execute (${kind === 'python' ? 'main.py' : 'main.go'}) on the remote runtime.`}
            </p>
            <Button
              size="sm"
              className="mx-auto gap-1.5 bg-emerald-600 text-white hover:bg-emerald-500"
              onClick={() => onRunProgram(stdin)}
            >
              <Play className="size-3.5 fill-current" /> Run {KIND_LABEL[kind]}
            </Button>
          </div>
        )}
        {status === 'running' && !hasOutput && (
          <div className="grid gap-2">
            <p className="text-amber-600">{stage ? STAGE_LABEL[stage] : 'Starting remote computer…'}</p>
            <p className="text-xs text-muted-foreground">
              First run can take up to ~20s while the computer wakes. Editing stays free — only runs use run time.
            </p>
          </div>
        )}
        {program?.stdout && (
          <pre className="whitespace-pre-wrap break-all text-foreground">{program.stdout.slice(0, 64000)}</pre>
        )}
        {program?.stderr && (
          <pre className="mt-2 whitespace-pre-wrap break-all text-red-600">{program.stderr.slice(0, 64000)}</pre>
        )}
      </div>

      <div className="shrink-0 border-t border-border/60 bg-muted/30 p-2">
        <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Stdin <span className="normal-case text-muted-foreground/70">(fed to input() / fmt.Scan)</span>
        </label>
        <Textarea
          value={stdin}
          onChange={(e) => setStdin(e.target.value)}
          placeholder={kind === 'python' ? 'Ada' : 'type stdin here…'}
          rows={2}
          className="font-mono text-xs"
        />
        <div className="mt-2 flex justify-end">
          <Button
            size="sm"
            className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-500"
            onClick={() => onRunProgram(stdin)}
          >
            <Play className="size-3.5 fill-current" /> Run
          </Button>
        </div>
      </div>
    </div>
  )
}
