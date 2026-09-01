import { useEffect, useRef, useState } from 'react'
import type { ConsoleEntry } from '../types'

const LEVEL_COLOR: Record<string, string> = {
  log: '#e6edf3',
  info: '#79c0ff',
  warn: '#f2cc60',
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
}

export default function ConsolePanel({ entries, onClear, collapsible }: ConsolePanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const [collapsed, setCollapsed] = useState(false)

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

  if (collapsible) {
    return (
      <div className={`console collapsible ${collapsed ? 'collapsed' : ''}`}>
        <button
          className="console-header console-toggle"
          onClick={() => setCollapsed((c) => !c)}
        >
          <span className="console-title">
            Console
            {entries.length > 0 && <span className="console-count">{entries.length}</span>}
            {errorCount > 0 && <span className="console-count error">{errorCount} err</span>}
          </span>
          <span className="console-toggle-icon">{collapsed ? '▲' : '▼'}</span>
        </button>
        {!collapsed && (
          <div className="console-body" ref={scrollRef} onScroll={onScroll}>
            {entries.length === 0 && (
              <div className="console-empty">No output yet.</div>
            )}
            {entries.map((e) => (
              <div key={e.id} className="console-line">
                <span className="console-level" style={{ color: LEVEL_COLOR[e.level] }}>
                  {LEVEL_LABEL[e.level] ?? e.level}
                </span>
                <span className="console-msg" style={{ color: LEVEL_COLOR[e.level] }}>
                  {e.message}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="console">
      <div className="console-header">
        <span className="console-title">
          Console
          {entries.length > 0 && <span className="console-count">{entries.length}</span>}
        </span>
        <button className="icon-btn small" title="Clear console" onClick={onClear}>Clear</button>
      </div>
      <div className="console-body" ref={scrollRef} onScroll={onScroll}>
        {entries.length === 0 && (
          <div className="console-empty">Output from console.log, errors and warnings appear here.</div>
        )}
        {entries.map((e) => (
          <div key={e.id} className="console-line">
            <span className="console-level" style={{ color: LEVEL_COLOR[e.level] }}>
              {LEVEL_LABEL[e.level] ?? e.level}
            </span>
            <span className="console-msg" style={{ color: LEVEL_COLOR[e.level] }}>
              {e.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}