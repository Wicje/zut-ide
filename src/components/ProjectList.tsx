import { useEffect, useState } from 'react'
import { supabaseOrNull } from '../lib/supabase'
import type { StoredRow } from '../lib/backend'

interface ProjectListProps {
  projects: StoredRow[]
  onOpen: (id: string) => void
  onOpenLocal: () => void
  onDelete: (id: string) => void
  onClose: () => void
  hasLocalDraft: boolean
}

export default function ProjectList({ projects, onOpen, onOpenLocal, onDelete, onClose, hasLocalDraft }: ProjectListProps) {
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [user, setUser] = useState<{ email?: string | null } | null>(null)

  useEffect(() => {
    supabaseOrNull()?.auth.getUser().then(({ data }) => setUser(data.user)).catch(() => {})
  }, [])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Projects</h2>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="project-list">
          {user && <div className="project-list-note">Signed in as {user.email}</div>}
          {hasLocalDraft && (
            <button className="project-row local" onClick={onOpenLocal}>
              <span className="project-row-name">current draft (not saved to cloud)</span>
              <span className="project-meta">local</span>
            </button>
          )}
          {projects.map((p) => (
            <div key={p.id} className="project-row" onClick={() => onOpen(p.id)}>
              <span className="project-row-name">{p.name}</span>
              <span className="project-meta">
                {p.share_token ? 'shared' : 'private'}
              </span>
              <span className="project-tools">
                {confirmId === p.id ? (
                  <>
                    <button className="icon-btn sm danger" onClick={(e) => { e.stopPropagation(); onDelete(p.id); setConfirmId(null) }}>Confirm</button>
                    <button className="icon-btn sm" onClick={(e) => { e.stopPropagation(); setConfirmId(null) }}>Cancel</button>
                  </>
                ) : (
                  <button className="icon-btn sm" title="Delete" onClick={(e) => { e.stopPropagation(); setConfirmId(p.id) }}>✕</button>
                )}
              </span>
            </div>
          ))}
          {projects.length === 0 && !hasLocalDraft && <div className="project-list-empty">No saved projects yet.</div>}
        </div>
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}