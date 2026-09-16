import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ChevronDown, ChevronUp, Eraser } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ConsoleEntry } from '../types'

const MIN_HEIGHT = 80
const MAX_HEIGHT_FRACTION = 0.6
const DEFAULT_HEIGHT = 160
const HEIGHT_KEY = 'zut:console:height'

const LEVEL_COLOR: Record<string, string> = {
  log: '#e6edf3',
  info: '#79c0ff',
  warn: '#f0b429',
  error: '#ff7b72',
  debug: '#8b949e',
}

const LEVEL_LABEL: Record<string, string> = {
  log: 'LOG',
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
  debug: 'DEBUG',
}

interface ConsolePanelProps {
  entries: ConsoleEntry[]
  onClear: () => void
  collapsible?: boolean
  resizable?: boolean
}

export default function ConsolePanel({ entries, onClear, collapsible, resizable }: ConsolePanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const [collapsed, setCollapsed] = useState(false)
  const [height, setHeight] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(HEIGHT_KEY))
      return Number.isFinite(saved) && saved >= MIN_HEIGHT ? saved : DEFAULT_HEIGHT
    } catch {
      return DEFAULT_HEIGHT
    }
  })
  const handleRef = useRef<HTMLDivElement>(null)
  const dragStart = useRef<{ y: number; height: number } | null>(null)

  useEffect(() => {
    if (resizable && !collapsible) {
      try { localStorage.setItem(HEIGHT_KEY, String(height)) } catch {}
    }
  }, [height, resizable, collapsible])

  const errorCount = entries.filter((e) => e.level === 'error').length

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [entries, collapsed])

  function onScroll() {
    const el = scrollRef.current
    if (!el) return
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
  }

  function onDragStart(e: React.PointerEvent<HTMLDivElement>) {
    dragStart.current = { y: e.clientY, height }
    handleRef.current?.setPointerCapture(e.pointerId)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'row-resize'
  }

  function onDragMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragStart.current) return
    const delta = dragStart.current.y - e.clientY
    const max = Math.round(window.innerHeight * MAX_HEIGHT_FRACTION)
    setHeight(Math.min(max, Math.max(MIN_HEIGHT, dragStart.current.height + delta)))
  }

  function onDragEnd(e: React.PointerEvent<HTMLDivElement>) {
    dragStart.current = null
    handleRef.current?.releasePointerCapture(e.pointerId)
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
  }

  const header = (
    <div className="flex h-9 shrink-0 items-center justify-between border-b border-border/60 bg-muted/30 px-3">
      <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        Console
        {entries.length > 0 && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px] text-foreground/80">
            {entries.length}
          </span>
        )}
        {errorCount > 0 && (
          <span className="rounded-full bg-destructive/15 px-1.5 py-0.5 font-mono text-[10px] text-destructive">
            {errorCount} err
          </span>
        )}
      </span>
      {collapsible ? (
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </Button>
      ) : (
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-muted-foreground" onClick={onClear}>
          <Eraser className="size-3.5" /> Clear
        </Button>
      )}
    </div>
  )

  const body = (
    <div
      ref={scrollRef}
      className="h-full overflow-auto px-3 py-1.5 font-mono text-[12px] leading-5"
      onScroll={onScroll}
    >
      {entries.length === 0 ? (
        <div className="px-0 py-1 text-xs text-muted-foreground">
          {collapsible
            ? 'No output yet.'
            : 'Output from console.log, errors and warnings appear here.'}
        </div>
      ) : (
        entries.map((e) => {
          const color = LEVEL_COLOR[e.level] ?? '#e6edf3'
          return (
            <div key={e.id} className="whitespace-pre-wrap break-all">
              <span className="mr-2 select-none text-[10px] font-semibold" style={{ color }}>
                {LEVEL_LABEL[e.level] ?? e.level}
              </span>
              <span style={{ color }}>{e.message}</span>
            </div>
          )
        })
      )}
    </div>
  )

  return (
    <div
      className={cn('flex shrink-0 flex-col overflow-hidden', collapsible ? (collapsed ? 'h-24' : 'h-40') : '')}
      style={resizable && !collapsible ? { height } : undefined}
    >
      {resizable && !collapsible && (
        <div
          ref={handleRef}
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize console"
          className="h-1.5 shrink-0 cursor-row-resize touch-none border-b border-border/30 bg-border/30 transition-colors hover:bg-border/70"
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
        />
      )}
      {header}
      {(!collapsible || !collapsed) && <div className="min-h-0 flex-1">{body}</div>}
    </div>
  )
}