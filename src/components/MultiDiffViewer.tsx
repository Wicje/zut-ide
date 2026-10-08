import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import type { FileMap } from '../types'
import { diffLines, diffStat } from '../lib/aiEdits'
import { ChevronDown, ChevronRight, FileDiff } from 'lucide-react'

const DiffViewer = lazy(() => import('./DiffViewer'))

interface MultiDiffViewerProps {
  base: FileMap
  current: FileMap
  /** File to expand first (usually the active editor file). */
  focusFile?: string | null
}

interface FileChange {
  path: string
  added: number
  removed: number
}

// Multi-file review: every file changed vs the snapshot, collapsible,
// diff rendered lazily on first expand (one Monaco instance per open file).
export default function MultiDiffViewer({ base, current, focusFile }: MultiDiffViewerProps) {
  const changes = useMemo<FileChange[]>(() => {
    const out: FileChange[] = []
    for (const f of new Set([...Object.keys(base), ...Object.keys(current)]).values()) {
      const a = base[f] ?? ''
      const b = current[f] ?? ''
      if (a === b) continue
      const s = diffStat(diffLines(a, b))
      out.push({ path: f, added: s.added, removed: s.removed })
      if (out.length >= 50) break
    }
    return out.sort((x, y) => x.path.localeCompare(y.path))
  }, [base, current])

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(focusFile ? [focusFile] : []))
  useEffect(() => {
    if (focusFile) setExpanded((prev) => new Set(prev).add(focusFile))
  }, [focusFile])

  function toggle(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  if (changes.length === 0) {
    return (
      <div className="grid h-full place-content-center gap-2 px-6 text-center">
        <FileDiff className="mx-auto size-8 opacity-40" />
        <p className="text-sm text-muted-foreground">No changes vs the last snapshot.</p>
        <p className="text-xs text-muted-foreground">Edit code or accept an agent change, then come back.</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto">
      {changes.map((c) => {
        const open = expanded.has(c.path)
        return (
          <div key={c.path} className="border-b border-border/60">
            <button
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50"
              onClick={() => toggle(c.path)}
              aria-expanded={open}
            >
              {open ? <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />}
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{c.path}</span>
              <span className="shrink-0 font-mono text-[11px]">
                <span className="text-emerald-600">+{c.added}</span>{' '}
                <span className="text-red-600">-{c.removed}</span>
              </span>
            </button>
            {open && (
              <div className="h-72 border-t border-border/60">
                <Suspense fallback={<div className="grid h-full place-content-center font-mono text-xs text-muted-foreground">Loading diff…</div>}>
                  <DiffViewer path={c.path} original={base[c.path] ?? ''} modified={current[c.path] ?? ''} />
                </Suspense>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
