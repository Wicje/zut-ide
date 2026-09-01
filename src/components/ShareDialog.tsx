import { useState } from 'react'

interface ShareDialogProps {
  link: string
  onClose: () => void
  onStopSharing: () => void
}

export default function ShareDialog({ link, onClose, onStopSharing }: ShareDialogProps) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Share project</h2>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <p className="share-note">
          Anyone with this link can <strong>view</strong> your project. They can't edit or save changes.
        </p>
        <div className="share-link">
          <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
          <button className="btn primary" onClick={copy}>{copied ? 'Copied!' : 'Copy'}</button>
        </div>
        <div className="share-actions">
          <a className="btn" href={link} target="_blank" rel="noreferrer">Open shared view</a>
          <button className="btn danger" onClick={async () => { await onStopSharing(); onClose() }}>
            Stop sharing
          </button>
        </div>
      </div>
    </div>
  )
}