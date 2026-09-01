import { useState, useRef, useEffect } from 'react'
import { useWorkspace } from '../store/workspace'
import type { FileMap } from '../types'

const FILE_KINDS = [
  { label: 'HTML', file: 'newpage.html', content: '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <title>New page</title>\n  <style>\n\n  </style>\n</head>\n<body>\n  <h1>New page</h1>\n</body>\n</html>\n' },
  { label: 'CSS', file: 'styles.css', content: '/* styles */\n' },
  { label: 'JavaScript', file: 'app.js', content: 'console.log("Hello!");\n' },
  { label: 'TypeScript', file: 'app.ts', content: 'const greeting: string = "Hello!";\nconsole.log(greeting);\n' },
  { label: 'JSON', file: 'data.json', content: '{\n  "key": "value"\n}\n' },
  { label: 'Text', file: 'notes.txt', content: '' },
] as const

function languageBadge(path: string): string {
  const i = path.lastIndexOf('.')
  return i === -1 ? '?' : path.slice(i + 1).toUpperCase()
}

const COLORS: Record<string, string> = {
  HTML: '#e44d26',
  CSS: '#2965f1',
  JS: '#f0db4f',
  TS: '#3178c6',
  JSON: '#7d8590',
  TXT: '#9da5b1',
}

const ACCEPT_TYPES = '.html,.htm,.css,.scss,.less,.js,.jsx,.ts,.tsx,.mjs,.json,.txt,.md,.svg,.png,.jpg,.jpeg,.gif,.webp,.ico,.woff,.woff2,.ttf,.otf,.map'

interface FileExplorerProps {
  readOnly: boolean
  onFileUpload?: (files: FileMap) => void
}

export default function FileExplorer({ readOnly, onFileUpload }: FileExplorerProps) {
  const { state, dispatch } = useWorkspace()
  const [menuOpen, setMenuOpen] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const files = Object.keys(state.files).sort()

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  function uniqueName(base: string): string {
    if (!(base in state.files)) return base
    const dot = base.lastIndexOf('.')
    const name = dot === -1 ? base : base.slice(0, dot)
    const ext = dot === -1 ? '' : base.slice(dot)
    let i = 2
    while (`${name}${i}${ext}` in state.files) i++
    return `${name}${i}${ext}`
  }

  function addFile(kind: (typeof FILE_KINDS)[number]) {
    const path = uniqueName(kind.file)
    dispatch({ type: 'ADD_FILE', path, content: kind.content })
    setMenuOpen(false)
  }

  function confirmDelete(path: string) {
    if (Object.keys(state.files).length <= 1) return
    if (window.confirm(`Delete ${path}?`)) dispatch({ type: 'DELETE_FILE', path })
  }

  function startRename(path: string) {
    const next = window.prompt('Rename file:', path)
    if (!next || next === path || next.includes('/')) return
    if (next in state.files) return window.alert('A file with that name already exists.')
    dispatch({ type: 'RENAME_FILE', oldPath: path, newPath: next })
  }

  async function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const inputFiles = e.target.files
    if (!inputFiles) return
    await processFiles(inputFiles)
    e.target.value = ''
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const dropped = e.dataTransfer.files
    if (dropped.length) await processFiles(dropped)
  }

  async function processFiles(inputFiles: FileList) {
    const newFiles: FileMap = {}
    for (const file of Array.from(inputFiles)) {
      const name = uniqueName(file.name)
      const isImage = file.type.startsWith('image/')
      const isText = file.type.startsWith('text/') || file.type === 'application/json' || /\.(json|js|ts|tsx|jsx|css|scss|less|html|htm|md|txt|svg|map)$/i.test(file.name)

      if (isImage) {
        const dataUrl = await readFileAsDataUrl(file)
        newFiles[name] = dataUrl
      } else if (isText || file.size < 512_000) {
        const text = await file.text()
        newFiles[name] = text
      }
    }
    if (onFileUpload) {
      onFileUpload(newFiles)
    } else {
      for (const [path, content] of Object.entries(newFiles)) {
        dispatch({ type: 'ADD_FILE', path, content })
      }
    }
  }

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.readAsDataURL(file)
    })
  }

  return (
    <div
      className={`explorer ${dragOver ? 'drag-over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <div className="explorer-header">
        <span>Files</span>
        <div className="explorer-actions" ref={menuRef}>
          {!readOnly && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPT_TYPES}
                style={{ display: 'none' }}
                onChange={handleFileInput}
              />
              <button
                className="icon-btn"
                title="Upload file"
                onClick={() => fileInputRef.current?.click()}
              >
                ↑
              </button>
              <div className="menu-wrap">
                <button className="icon-btn" title="New file" onClick={() => setMenuOpen((o) => !o)}>
                  ＋
                </button>
                {menuOpen && (
                  <div className="menu">
                    {FILE_KINDS.map((k) => (
                      <button key={k.label} onClick={() => addFile(k)}>
                        <span className="badge" style={{ color: COLORS[k.label] }}>{k.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      {dragOver && <div className="explorer-drop-hint">Drop files here</div>}
      <ul className="file-list">
        {files.map((file) => (
          <li
            key={file}
            className={state.activeFile === file ? 'file active' : 'file'}
            onClick={() => dispatch({ type: 'SET_ACTIVE', path: file })}
          >
            <span className="file-badge" style={{ color: COLORS[languageBadge(file)] ?? '#9da5b1' }}>
              {languageBadge(file)}
            </span>
            <span className="file-name">{file}</span>
            {!readOnly && (
              <span className="file-tools">
                <button className="icon-btn small" title="Rename" onClick={(e) => { e.stopPropagation(); startRename(file) }}>✎</button>
                <button className="icon-btn small" title="Delete" onClick={(e) => { e.stopPropagation(); confirmDelete(file) }}>✕</button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {files.length === 0 && <div className="explorer-empty">No files yet</div>}
    </div>
  )
}