import { useState } from 'react'

interface ImportDialogProps {
  onClose: () => void
  onImport: (url: string) => void
}

export default function ImportDialog({ onClose, onImport }: ImportDialogProps) {
  const [url, setUrl] = useState('')

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Import project</h2>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <p className="share-note">
          Paste a URL to import. Supports HTML pages, CodePen, and GitHub raw files.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (url.trim()) onImport(url.trim())
          }}
        >
          <label>
            URL
            <input
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://codepen.io/user/pen/abc123"
              autoFocus
            />
          </label>
          <button type="submit" className="btn primary" disabled={!url.trim()}>
            Import
          </button>
        </form>
      </div>
    </div>
  )
}