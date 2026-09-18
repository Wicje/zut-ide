import { useState, useRef, useEffect } from 'react'
import { useWorkspace } from '../store/workspace'
import type { FileMap } from '../types'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Upload, Plus, Pencil, Trash2, FilePlus2 } from 'lucide-react'
import { cn } from '@/lib/utils'

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
  const { state, dispatch, addConsole } = useWorkspace()
  const [dragOver, setDragOver] = useState(false)
  const [creating, setCreating] = useState<{ content: string; name: string } | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const createInputRef = useRef<HTMLInputElement>(null)

  // Radix returns focus to the + trigger when its menu closes, stealing the
  // input's autofocus. Re-claim focus after the menu finishes closing.
  useEffect(() => {
    if (!creating) return
    const t = setTimeout(() => createInputRef.current?.focus(), 60)
    return () => clearTimeout(t)
  }, [creating])

  const files = Object.keys(state.files).sort()

  function uniqueName(base: string): string {
    if (!(base in state.files)) return base
    const dot = base.lastIndexOf('.')
    const name = dot === -1 ? base : base.slice(0, dot)
    const ext = dot === -1 ? '' : base.slice(dot)
    let i = 2
    while (`${name}${i}${ext}` in state.files) i++
    return `${name}${i}${ext}`
  }

  function startCreate(kind: (typeof FILE_KINDS)[number]) {
    setCreating({ content: kind.content, name: kind.file })
    setCreateError(null)
  }

  function commitCreate() {
    if (!creating) return
    const name = creating.name.trim()
    if (!name) {
      setCreateError('Give the file a name — e.g. about.html.')
      return
    }
    if (name.includes('/') || name === '.' || name === '..') {
      setCreateError('Plain file names only — no folders yet (e.g. about.html).')
      return
    }
    const path = uniqueName(name)
    dispatch({ type: 'ADD_FILE', path, content: creating.content })
    addConsole('info', path === name ? `Added ${path}.` : `Added ${path} (named to avoid a clash).`)
    setCreating(null)
    setCreateError(null)
  }

  function cancelCreate() {
    setCreating(null)
    setCreateError(null)
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
      className="relative flex h-full flex-col"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border/60 px-3">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Files <span className="ml-1 font-mono text-muted-foreground/60">{files.length}</span>
        </span>
        {!readOnly && (
          <div className="flex items-center gap-0.5">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ACCEPT_TYPES}
              style={{ display: 'none' }}
              onChange={handleFileInput}
            />
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              title="Upload file"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="size-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7" title="New file">
                  <Plus className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-52"
                // Don't yank focus back to the + trigger on close: the inline
                // naming input needs it (Radix restores focus after exit).
                onCloseAutoFocus={(e) => e.preventDefault()}
              >
                {FILE_KINDS.map((k) => (
                  <DropdownMenuItem key={k.label} onSelect={() => startCreate(k)}>
                    <FilePlus2 className="mr-2 size-4 text-muted-foreground" />
                    <span className="font-mono text-xs" style={{ color: COLORS[k.label] }}>
                      {k.label}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {dragOver && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md border-2 border-dashed border-emerald-500/50 bg-background/80 text-sm font-medium text-emerald-400">
          Drop files here
        </div>
      )}

      <ScrollArea className="min-h-0 flex-1">
        <ul className="p-1.5">
          {!readOnly && creating && (
            <li className="px-0.5 py-0.5">
              <Input
                autoFocus
                ref={createInputRef}
                value={creating.name}
                onChange={(e) => {
                  setCreating({ ...creating, name: e.target.value })
                  setCreateError(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitCreate()
                  else if (e.key === 'Escape') cancelCreate()
                }}
                className="h-7 font-mono text-[13px]"
                aria-label="New file name — Enter to create, Esc to cancel"
              />
              {createError && <p className="px-2 pt-1 text-[11px] text-red-400">{createError}</p>}
            </li>
          )}
          {files.map((file) => {
            const active = state.activeFile === file
            const color = COLORS[languageBadge(file)] ?? '#9da5b1'
            return (
              <li
                key={file}
                tabIndex={0}
                role="button"
                aria-label={`Open ${file}`}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'group relative flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors outline-none focus-visible:ring-1 focus-visible:ring-ring',
                  active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60 text-foreground/90',
                )}
                onClick={() => dispatch({ type: 'SET_ACTIVE', path: file })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    dispatch({ type: 'SET_ACTIVE', path: file })
                  }
                }}
              >
                <span
                  aria-hidden
                  className={cn(
                    'absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-emerald-400 transition-opacity',
                    active ? 'opacity-100' : 'opacity-0',
                  )}
                />
                <span className="w-8 shrink-0 font-mono text-[10px] font-semibold" style={{ color }}>
                  {languageBadge(file)}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{file}</span>
                {!active && state.aiTouched[file] != null && (
                  <span
                    className="size-1.5 shrink-0 rounded-full bg-violet-400"
                    title="Changed by AI — open to review"
                  />
                )}
                {!readOnly && (
                  <span className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 md:focus-within:opacity-100">
                    <button
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      title={`Rename ${file}`}
                      aria-label={`Rename ${file}`}
                      onClick={(e) => { e.stopPropagation(); startRename(file) }}
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
                      title={`Delete ${file}`}
                      aria-label={`Delete ${file}`}
                      onClick={(e) => { e.stopPropagation(); confirmDelete(file) }}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </span>
                )}
              </li>
            )
          })}
        </ul>
        {files.length === 0 && (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
            No files yet — add one with the + button.
          </div>
        )}
      </ScrollArea>
    </div>
  )
}