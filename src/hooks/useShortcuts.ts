import { useEffect, useRef } from 'react'

interface ShortcutHandlers {
  onRun: () => void
  onSave: () => void
  onToggleAi: () => void
}

/**
 * Global IDE shortcuts: Ctrl/Cmd+Enter = Run, Ctrl/Cmd+S = Save,
 * Ctrl/Cmd+K = toggle the AI panel. Handlers are read through a ref so the
 * single window listener never invokes a stale closure.
 */
export function useShortcuts(handlers: ShortcutHandlers) {
  const ref = useRef(handlers)
  ref.current = handlers
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key === 'Enter') {
        e.preventDefault()
        ref.current.onRun()
      } else if (mod && (e.key === 's' || e.key === 'S')) {
        e.preventDefault()
        ref.current.onSave()
      } else if (mod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        ref.current.onToggleAi()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
