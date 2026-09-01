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

const STATUS_CLASS: Record<RunStatus, string> = {
  idle: 'idle',
  running: 'running',
  done: 'done',
  error: 'error',
}

const VIEWPORTS = [
  { label: '375', width: 375, icon: '📱' },
  { label: '768', width: 768, icon: '📋' },
  { label: 'All', width: 'auto' as const, icon: '🖥' },
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
    <div className="preview">
      <div className="preview-header">
        <span className="preview-title">Result</span>
        {showViewportControls && onViewportChange && (
          <div className="viewport-controls">
            {VIEWPORTS.map((vp) => (
              <button
                key={vp.label}
                className={
                  viewport === vp.width ? 'viewport-btn active' : 'viewport-btn'
                }
                onClick={() => onViewportChange(vp.width)}
                title={`${vp.label === 'All' ? 'Full width' : vp.label + 'px'}`}
              >
                <span className="vp-icon">{vp.icon}</span>
                <span className="vp-label">{vp.label === 'All' ? 'Full' : vp.label}</span>
              </button>
            ))}
          </div>
        )}
        <span className={`status-chip ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</span>
      </div>
      <div className="preview-body">
        {srcDoc ? (
          <div className="preview-frame-wrap" style={viewport !== 'auto' ? { maxWidth: viewport, margin: '0 auto' } : undefined}>
            <iframe
              key={runKey}
              title="preview"
              srcDoc={srcDoc}
              sandbox="allow-scripts allow-forms allow-modals allow-popups"
              className="preview-frame"
              style={viewport !== 'auto' ? { width: viewport, maxWidth: '100%' } : undefined}
            />
          </div>
        ) : (
          <div className="preview-empty">Click Run to see your page here.</div>
        )}
      </div>
    </div>
  )
}