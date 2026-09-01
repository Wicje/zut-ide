import { useEffect, useRef, useState } from 'react'
import { useWorkspace } from '../store/workspace'
import { emptyProject, javascriptStarter, typescriptStarter } from '../lib/templates'

interface ToolbarProps {
  user: { email?: string | null } | null | undefined
  autoplay: boolean
  onToggleAutoplay: () => void
  onRun: () => void
  onSave: () => void
  onDownload: () => void
  onShare: () => void
  onOpenProjects: () => void
  onLogin: () => void
  onLogout: () => void
  onNewProject: (files: Record<string, string>, name: string) => void
  onFormat: () => void
  onDeploy: () => void
  onImport: () => void
  formatting: boolean
  deploying: boolean
  isMobile: boolean
  shareLink: string | null
}

const NEW_PROJECTS = [
  { label: 'Empty project', name: 'my-project', files: () => emptyProject() },
  { label: 'JavaScript playground', name: 'js-playground', files: () => javascriptStarter() },
  { label: 'TypeScript playground', name: 'ts-playground', files: () => typescriptStarter() },
] as const

export default function Toolbar(props: ToolbarProps) {
  const { state, dispatch } = useWorkspace()
  const [newMenu, setNewMenu] = useState(false)
  const [nameInput, setNameInput] = useState(state.projectName)
  const menuRef = useRef<HTMLDivElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => setNameInput(state.projectName), [state.projectName])

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setNewMenu(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  return (
    <header className="toolbar">
      <div className="toolbar-left">
        <span className="logo">▸|‹ zut</span>
        {state.isSharedView ? (
          <span className="shared-badge">shared view (read-only)</span>
        ) : (
          <>
            <input
              ref={nameRef}
              className="project-name"
              value={nameInput}
              placeholder="Project name"
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={() => dispatch({ type: 'SET_NAME', name: nameInput || 'untitled' })}
              onKeyDown={(e) => e.key === 'Enter' && nameRef.current?.blur()}
            />
            <span className="save-indicator">{state.saved ? 'saved' : 'unsaved'}</span>
          </>
        )}
      </div>

      <div className="toolbar-right">
        {!state.isSharedView && !state.readOnly && (
          <>
            <div className="menu-wrap" ref={menuRef}>
              <button className="btn" onClick={() => setNewMenu((o) => !o)}>New ▾</button>
              {newMenu && (
                <div className="menu new-project-menu">
                  {NEW_PROJECTS.map((p) => (
                    <button
                      key={p.label}
                      onClick={() => {
                        setNewMenu(false)
                        props.onNewProject(p.files(), p.name)
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                  <button onClick={() => { setNewMenu(false); props.onImport() }}>
                    Import from URL…
                  </button>
                </div>
              )}
            </div>
            <button className="btn" onClick={props.onOpenProjects}>Projects</button>
          </>
        )}
        {!props.isMobile && (
          <label className="autoplay" title="Auto-run after every edit">
            <input type="checkbox" checked={props.autoplay} onChange={props.onToggleAutoplay} />
            Auto-run
          </label>
        )}
        <button className="btn primary run" onClick={props.onRun}>▶ Run</button>
        {!state.isSharedView && !state.readOnly && (
          <>
            <button className="btn" onClick={props.onSave}>Save</button>
            <button className="btn" onClick={props.onFormat} disabled={props.formatting}>
              {props.formatting ? '…' : 'Format'}
            </button>
            {!props.isMobile && <button className="btn" onClick={props.onDownload}>⬇ ZIP</button>}
            <button className="btn" onClick={props.onDeploy} disabled={props.deploying}>
              {props.deploying ? '…' : '⬆ Deploy'}
            </button>
            <button className="btn" onClick={props.onShare} disabled={!props.shareLink && !state.projectId}>
              Share
            </button>
          </>
        )}

        <div className="user-area">
          {props.user ? (
            <button className="btn" onClick={props.onLogout} title={props.user.email ?? ''}>
              {props.isMobile ? '👤' : `${props.user.email ?? 'Account'} ⌄`}
            </button>
          ) : (
            <button className="btn" onClick={props.onLogin}>{props.isMobile ? '👤' : 'Sign in'}</button>
          )}
        </div>
      </div>
    </header>
  )
}