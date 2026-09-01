import { useState } from 'react'

interface DeployDialogProps {
  url: string | null
  onClose: () => void
}

export default function DeployDialog({ url, onClose }: DeployDialogProps) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard unavailable */ }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Deployed!</h2>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        {url ? (
          <>
            <p className="share-note">Your project is live at:</p>
            <div className="share-link">
              <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} />
              <button className="btn primary" onClick={copy}>{copied ? 'Copied!' : 'Copy'}</button>
            </div>
            <div className="share-actions" style={{ marginTop: 12 }}>
              <a className="btn" href={url} target="_blank" rel="noreferrer">Open in new tab</a>
            </div>
          </>
        ) : (
          <p className="share-note">Deploying…</p>
        )}
      </div>
    </div>
  )
}