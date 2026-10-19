import { useEffect, useRef, useState } from 'react'

export const SIDEBAR_WIDTH = { min: 160, max: 320, reset: 210, narrow: 180 }
export const COMPOSER_WIDTH = { min: 260, max: 540, reset: 380, narrow: 320 }

/**
 * Resizable three-pane widths. Owns the drag listeners so App.tsx does not
 * need to wire window mousemove/mouseup for each divider.
 */
export function usePaneWidths() {
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_WIDTH.reset)
  const [composerWidth, setComposerWidth] = useState(COMPOSER_WIDTH.reset)
  const [isResizingSidebar, setIsResizingSidebar] = useState(false)
  const [isResizingComposer, setIsResizingComposer] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Tablet/narrow defaults: slimmer rails so the 3-column shell still fits.
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1100) {
      setSidebarWidth(SIDEBAR_WIDTH.narrow)
      setComposerWidth(COMPOSER_WIDTH.narrow)
    }
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const relativeX = e.clientX - rect.left

      if (isResizingSidebar) {
        setSidebarWidth(Math.min(Math.max(relativeX, SIDEBAR_WIDTH.min), SIDEBAR_WIDTH.max))
      } else if (isResizingComposer) {
        const next = Math.min(Math.max(relativeX - sidebarWidth, COMPOSER_WIDTH.min), COMPOSER_WIDTH.max)
        setComposerWidth(next)
      }
    }

    const handleMouseUp = () => {
      if (isResizingSidebar || isResizingComposer) {
        setIsResizingSidebar(false)
        setIsResizingComposer(false)
      }
    }

    if (isResizingSidebar || isResizingComposer) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizingSidebar, isResizingComposer, sidebarWidth])

  return {
    containerRef,
    sidebarWidth,
    composerWidth,
    isResizingSidebar,
    isResizingComposer,
    setSidebarWidth,
    setComposerWidth,
    setIsResizingSidebar,
    setIsResizingComposer,
  }
}
