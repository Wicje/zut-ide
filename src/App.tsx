import { useCallback, useEffect, useRef, useState } from 'react'
import { useWorkspace } from './store/workspace'
import {
  CONSOLE_SOURCE,
  bundleProject,
  buildSrcdoc,
  formatBuildErrors,
  initRunner,
} from './lib/runner'
import { bundleProjectRemote, canUseRemote } from './lib/runtime'
import { supabaseOrNull } from './lib/supabase'
import {
  createProject,
  deleteProject,
  getProject,
  getSharedProject,
  listProjects,
  loadLocalWorkspace,
  saveLocalWorkspace,
  setProjectShared,
  updateProject,
  type StoredRow,
} from './lib/backend'
import { downloadProjectZip } from './lib/download'
import { emptyProject } from './lib/templates'
import { formatCode } from './lib/formatter'
import { importFromUrl } from './lib/importer'
import {
  listenForExternalWorkspaceChange,
  maybeHeartbeatBackup,
  recordHeartbeatBackup,
  recoverActiveWorkspace,
  saveWorkspaceSnapshot,
} from './lib/persistence'
import Toolbar from './components/Toolbar'
import FileExplorer from './components/FileExplorer'
import CodeEditor from './components/CodeEditor'
import Preview from './components/Preview'
import ConsolePanel from './components/ConsolePanel'
import Login from './components/Login'
import ProjectList from './components/ProjectList'
import ShareDialog from './components/ShareDialog'
import ImportDialog from './components/ImportDialog'
import DeployDialog from './components/DeployDialog'
import HistoryDialog from './components/HistoryDialog'
import AiPanel from './components/AiPanel'
import { AlertTriangle, Braces, MonitorPlay, FolderOpen, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { EditorSelection, FileMap, RunStatus } from './types'

function parseHash(): string | null {
  const m = window.location.hash.match(/^#\/p\/([\w-]+)/)
  return m ? m[1] : null
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    mq.addEventListener('change', onChange)
    setMatches(mq.matches)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return matches
}

function resolveErrorFile(file: string | undefined, files: FileMap): string | undefined {
  if (!file || file === '<stdin>') return undefined
  const cleaned = file.replace(/^[a-zA-Z][\w-]*:\/*/, '').replace(/^\.?\/+/, '')
  const candidates = [cleaned, cleaned.split('/').pop() ?? '']
  for (const candidate of candidates) {
    if (candidate && candidate in files) return candidate
  }
  return undefined
}

export default function App() {
  const { state, dispatch, addConsole, clearConsole, loadFiles } = useWorkspace()
  const [user, setUser] = useState<{ email?: string | null } | null | undefined>(undefined)
  const [autoplay, setAutoplay] = useState(true)
  const [srcDoc, setSrcDoc] = useState('')
  const [runKey, setRunKey] = useState(0)
  const [showLogin, setShowLogin] = useState(false)
  const [showProjects, setShowProjects] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showDeploy, setShowDeploy] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showAi, setShowAi] = useState(false)
  const [projects, setProjects] = useState<StoredRow[]>([])
  const [shareLink, setShareLink] = useState<string | null>(null)
  const [status, setStatus] = useState<RunStatus>('idle')
  const [hasLocalDraft, setHasLocalDraft] = useState(false)
  const wasmPromise = useRef<Promise<void> | null>(null)
  const ensureWasm = useCallback(() => {
    if (!wasmPromise.current) wasmPromise.current = initRunner()
    return wasmPromise.current
  }, [])
  const isMobile = useMediaQuery('(max-width: 860px)')
  const [mobileView, setMobileView] = useState<'code' | 'result' | 'files'>('code')
  const fileStripRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isMobile || !state.activeFile) return
    const el = fileStripRef.current?.querySelector<HTMLElement>(`[data-file="${CSS.escape(state.activeFile)}"]`)
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [isMobile, state.activeFile])
  const [viewport, setViewport] = useState<'auto' | number>('auto')
  const [formatting, setFormatting] = useState(false)
  const [reveal, setReveal] = useState<{ token: number; line?: number; column?: number } | null>(null)
  const [aiSelection, setAiSelection] = useState<EditorSelection | null>(null)

  const sortedFiles = Object.keys(state.files).sort()
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)
  const isSwiping = useRef(false)
  const lastLocalWrite = useRef(0)
  const lastSnapshotAt = useRef(0)
  const conflictWarned = useRef(false)
  const recoveredRef = useRef(false)
  const firstRunRef = useRef(true)

  const run = useCallback(
    async (files?: FileMap) => {
      const target = files ?? state.files
      setStatus('running')
      clearConsole()
      try {
        let bundle
        if (canUseRemote(target)) {
          try {
            bundle = await bundleProjectRemote(target)
          } catch (e) {
            if ((e as Error).message.startsWith('BUILD_FAILED:')) throw e
            addConsole('warn', 'Remote runtime unavailable — building in the browser instead.')
            await ensureWasm()
            bundle = await bundleProject(target)
          }
        } else {
          await ensureWasm()
          bundle = await bundleProject(target)
        }
        setSrcDoc(buildSrcdoc(target['index.html'], bundle))
        setRunKey((k) => k + 1)
        setStatus('done')
      } catch (e) {
        setSrcDoc('')
        for (const err of formatBuildErrors(e)) {
          const file = resolveErrorFile(err.location?.file, target)
          const loc = err.location
            ? ` (line ${err.location.line}${err.location.column ? `:${err.location.column}` : ''})`
            : ''
          addConsole(
            'error',
            file ? `Build error: ${err.message}` : `Build error${loc}: ${err.message}`,
            { file, line: err.location?.line, column: err.location?.column },
          )
        }
        setStatus('error')
      }
    },
    [state.files, addConsole, clearConsole, ensureWasm],
  )

  const openLocation = useCallback(
    (file: string, line?: number, column?: number) => {
      if (!(file in state.files)) return
      dispatch({ type: 'SET_ACTIVE', path: file })
      setMobileView('code')
      setReveal({ token: Date.now(), line, column })
    },
    [dispatch, state.files],
  )

  useEffect(() => {
    const supabase = supabaseOrNull()
    if (!supabase) { setUser(null); return }
    supabase.auth.getUser().then(({ data }: { data: { user: { email?: string | null } | null } }) => setUser(data.user ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((_event: string, session: { user: { email?: string | null } | null } | null) => {
      setUser(session?.user ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const data = e.data
      if (data && data.source === CONSOLE_SOURCE && data.type === 'console') {
        addConsole(data.payload.level, data.payload.message)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [addConsole])

  useEffect(() => { setHasLocalDraft(Boolean(loadLocalWorkspace())) }, [])

  useEffect(() => {
    const shared = parseHash()
    if (shared) {
      getSharedProject(shared)
        .then((p) => { loadFiles(p.files, p.name, { readOnly: true, isSharedView: true }); setSrcDoc('') })
        .catch((e) => addConsole('error', `Could not open shared project: ${e.message}`))
      return
    }
    const draft = loadLocalWorkspace()
    if (draft && Object.keys(draft.files).length) {
      loadFiles(draft.files, draft.name)
    } else {
      loadFiles(emptyProject(), 'my-project')
    }
  }, [addConsole, loadFiles])

  // Recover from a wiped localStorage using the durable IndexedDB copy.
  useEffect(() => {
    if (recoveredRef.current || parseHash()) return
    recoveredRef.current = true
    if (loadLocalWorkspace()) return
    recoverActiveWorkspace().then((durable) => {
      if (durable && Object.keys(durable.files).length) {
        loadFiles(durable.files, durable.name)
        addConsole('info', 'Restored your workspace from durable storage.')
      }
    })
  }, [addConsole, loadFiles])

  // Cross-tab conflict detection: warn once when another tab writes this workspace.
  useEffect(() => {
    return listenForExternalWorkspaceChange((updatedAt) => {
      if (conflictWarned.current || updatedAt <= lastLocalWrite.current + 500) return
      conflictWarned.current = true
      addConsole('warn', 'This project was updated in another tab. Refresh to load the latest version.')
    })
  }, [addConsole])

  useEffect(() => {
    const onHashChange = () => {
      const shared = parseHash()
      if (shared) {
        getSharedProject(shared)
          .then((p) => loadFiles(p.files, p.name, { readOnly: true, isSharedView: true }))
          .catch((e) => addConsole('error', `Could not open shared project: ${e.message}`))
      }
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [addConsole, loadFiles])

  useEffect(() => {
    if (!autoplay) return
    if (Object.keys(state.files).length === 0) return
    const t = setTimeout(() => run(state.files), 900)
    return () => clearTimeout(t)
  }, [state.files, autoplay, run])

  useEffect(() => {
    if (state.isSharedView || !state.hydrated) return
    lastLocalWrite.current = Date.now()
    saveLocalWorkspace(state.projectName, state.files)
    if (firstRunRef.current) {
      firstRunRef.current = false
      return
    }
    const now = Date.now()
    if (now - lastSnapshotAt.current > 30_000 && Object.keys(state.files).length > 0) {
      lastSnapshotAt.current = now
      void saveWorkspaceSnapshot(state.projectId, state.projectName, state.files)
    }
    if (maybeHeartbeatBackup(state.projectName)) {
      void downloadProjectZip(state.projectName || 'project', state.files).then(() => {
        recordHeartbeatBackup(state.projectName || 'project')
      })
    }
  }, [state.files, state.projectName, state.isSharedView])

  useEffect(() => {
    if (!user || state.isSharedView || !state.projectId) return
    const projectId = state.projectId
    const t = setTimeout(() => {
      updateProject(projectId, state.projectName, state.files)
        .then(() => dispatch({ type: 'SET_SAVED', saved: true }))
        .catch((e: unknown) => addConsole('error', `Auto-save failed: ${(e as { message?: string }).message}`))
    }, 1500)
    return () => clearTimeout(t)
  }, [state.files, state.projectName, state.projectId, user, state.isSharedView, addConsole, dispatch])

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
    isSwiping.current = false
  }

  function onTouchMove(e: React.TouchEvent) {
    const dx = Math.abs(e.touches[0].clientX - touchStartX.current)
    const dy = Math.abs(e.touches[0].clientY - touchStartY.current)
    if (dx > 30 && dx > dy * 2) isSwiping.current = true
  }

  function onTouchEnd() {
    if (!isSwiping.current) return
    isSwiping.current = false
    const idx = sortedFiles.indexOf(state.activeFile)
    if (idx === -1) return
    const next = (idx + 1) % sortedFiles.length
    dispatch({ type: 'SET_ACTIVE', path: sortedFiles[next] })
  }

  async function refreshProjects() {
    if (!supabaseOrNull()) return
    try { setProjects(await listProjects()) } catch (e) {
      addConsole('error', `Could not load projects: ${(e as { message?: string }).message}`)
    }
  }

  function openProjects() { refreshProjects(); setShowProjects(true) }

  async function save() {
    if (state.isSharedView || state.readOnly) return
    if (!user) {
      saveLocalWorkspace(state.projectName, state.files)
      dispatch({ type: 'SET_SAVED', saved: true })
      addConsole('info', 'Saved to this device (sign in to save to the cloud).')
      return
    }
    try {
      let id = state.projectId
      if (!id) { id = await createProject(state.projectName, state.files); dispatch({ type: 'SET_PROJECT_ID', id }) }
      else await updateProject(id, state.projectName, state.files)
      dispatch({ type: 'SET_SAVED', saved: true })
      refreshProjects()
      addConsole('info', 'Saved to cloud.')
    } catch (e) { addConsole('error', `Save failed: ${(e as { message?: string }).message}`) }
  }

  function newProject(files: FileMap, name: string) {
    setShareLink(null); setSrcDoc('')
    if (parseHash()) history.replaceState(null, '', window.location.pathname)
    dispatch({ type: 'SET_PROJECT_ID', id: null })
    conflictWarned.current = false
    lastLocalWrite.current = 0
    firstRunRef.current = true
    loadFiles(files, name)
  }

  async function openProject(id: string) {
    if (id.startsWith('local-')) { const d = loadLocalWorkspace(); if (d) loadFiles(d.files, d.name); conflictWarned.current = false; lastLocalWrite.current = 0; firstRunRef.current = true; return }
    setShowProjects(false)
    try {
      const p = await getProject(id)
      setShareLink(p.share_token ? buildShareLink(p.share_token) : null)
      loadFiles(p.files, p.name, { projectId: p.id })
    } catch (e) { addConsole('error', `Could not open project: ${(e as { message?: string }).message}`) }
  }

  async function removeProject(id: string) {
    try { await deleteProject(id); refreshProjects() } catch (e) {
      addConsole('error', `Delete failed: ${(e as { message?: string }).message}`)
    }
  }

  function buildShareLink(token: string) { return `${window.location.origin}${window.location.pathname}#/p/${token}` }

  async function share() {
    if (!user || !state.projectId) return
    try {
      if (shareLink) { setShowShare(true); return }
      const token = await setProjectShared(state.projectId, true)
      if (token) { setShareLink(buildShareLink(token)); setShowShare(true); refreshProjects() }
    } catch (e) { addConsole('error', `Could not share: ${(e as { message?: string }).message}`) }
  }

  async function stopSharing() {
    if (!state.projectId) return
    try { await setProjectShared(state.projectId, false); setShareLink(null); refreshProjects() }
    catch (e) { addConsole('error', `Could not stop sharing: ${(e as { message?: string }).message}`) }
  }

  async function download() { await downloadProjectZip(state.projectName || 'project', state.files) }

  async function logout() { await supabaseOrNull()?.auth.signOut(); setUser(null) }

  async function formatActive() {
    if (!state.activeFile || formatting) return
    setFormatting(true)
    try {
      const ext = state.activeFile.split('.').pop() ?? ''
      if (!['html', 'htm', 'css', 'scss', 'less', 'js', 'jsx', 'mjs', 'ts', 'tsx', 'json'].includes(ext)) {
        addConsole('info', 'Formatting not supported for this file type.')
        return
      }
      const formatted = await formatCode(state.files[state.activeFile] ?? '', ext)
      dispatch({ type: 'SET_FILE', path: state.activeFile, content: formatted })
      addConsole('info', 'Formatted.')
    } catch (e) {
      addConsole('warn', `Format failed: ${(e as { message?: string }).message}`)
    } finally { setFormatting(false) }
  }

  function handleDeploy() {
    setShowDeploy(true)
  }

  function restoreSnapshot(name: string, files: FileMap) {
    setSrcDoc('')
    conflictWarned.current = false
    lastLocalWrite.current = 0
    firstRunRef.current = true
    loadFiles(files, name, { projectId: state.projectId })
    addConsole('info', `Restored snapshot of "${name}".`)
  }

  async function handleImport(url: string) {
    setShowImport(false)
    try {
      const result = await importFromUrl(url)
      newProject(result.files, result.name)
      addConsole('info', `Imported project "${result.name}" with ${Object.keys(result.files).length} files.`)
    } catch (e) {
      addConsole('error', `Import failed: ${(e as { message?: string }).message}`)
    }
  }

  const canShare = Boolean(user && state.projectId && !state.isSharedView)

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <Toolbar
        user={user}
        autoplay={autoplay}
        onToggleAutoplay={() => setAutoplay((a) => !a)}
        onRun={() => run()}
        onSave={save}
        onDownload={download}
        onShare={share}
        onOpenProjects={openProjects}
        onLogin={() => setShowLogin(true)}
        onLogout={logout}
        onNewProject={newProject}
        shareLink={canShare ? shareLink : null}
        onFormat={formatActive}
        onDeploy={handleDeploy}
        onHistory={() => setShowHistory(true)}
        onOpenAi={() => setShowAi(true)}
        onImport={() => setShowImport(true)}
        formatting={formatting}
        isMobile={isMobile}
      />

      {!supabaseOrNull() && (
        <div className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300">
          <AlertTriangle className="size-3.5 shrink-0" />
          <span className="truncate">
            Cloud not configured — running in local-only mode. Set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env
            to enable accounts, saving, and sharing.
          </span>
        </div>
      )}

      {isMobile ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div
            className="flex shrink-0 gap-1 overflow-x-auto border-b bg-muted/40 px-2 py-1.5"
            ref={fileStripRef}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            {sortedFiles.map((file) => {
              const active = state.activeFile === file
              return (
                <button
                  key={file}
                  data-file={file}
                  className={cn(
                    'shrink-0 rounded-md px-2.5 py-1 font-mono text-xs transition-colors',
                    active
                      ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  onClick={() => { dispatch({ type: 'SET_ACTIVE', path: file }); setMobileView('code') }}
                >
                  {file}
                </button>
              )
            })}
          </div>

          <div className="min-h-0 flex-1">
            {mobileView === 'code' && (
              <main className="h-full">
                {state.activeFile ? (
                  <CodeEditor
                    path={state.activeFile}
                    value={state.files[state.activeFile] ?? ''}
                    readOnly={state.isSharedView || state.readOnly}
                    onChange={(value) => dispatch({ type: 'SET_FILE', path: state.activeFile, content: value })}
                    reveal={reveal}
                    onSelectionChange={setAiSelection}
                  />
                ) : (
                  <div className="grid h-full place-content-center text-sm text-muted-foreground">
                    Create a file to get started.
                  </div>
                )}
              </main>
            )}
            {mobileView === 'result' && (
              <div className="flex h-full flex-col">
                <Preview srcDoc={srcDoc} runKey={runKey} status={status} />
                <ConsolePanel entries={state.consoleEntries} onClear={clearConsole} collapsible onOpenLocation={openLocation} />
              </div>
            )}
            {mobileView === 'files' && (
              <aside className="h-full">
                <FileExplorer readOnly={state.isSharedView || state.readOnly} />
              </aside>
            )}
          </div>

          <nav
            className="grid shrink-0 grid-cols-4 border-t bg-background/90 backdrop-blur"
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          >
            <MobileNavButton
              active={mobileView === 'code'}
              icon={<Braces className="size-5" />}
              label="Code"
              onClick={() => setMobileView('code')}
            />
            <MobileNavButton
              active={mobileView === 'result'}
              icon={<MonitorPlay className="size-5" />}
              label="Result"
              dot={status === 'error'}
              onClick={() => setMobileView('result')}
            />
            <MobileNavButton
              active={mobileView === 'files'}
              icon={<FolderOpen className="size-5" />}
              label="Files"
              onClick={() => setMobileView('files')}
            />
            <MobileNavButton
              active={showAi}
              icon={<Sparkles className="size-5" />}
              label="AI"
              onClick={() => setShowAi(true)}
            />
          </nav>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[248px_minmax(0,1fr)_minmax(320px,42%)]">
          <aside className="min-h-0 border-r border-border bg-muted/30">
            <FileExplorer readOnly={state.isSharedView || state.readOnly} />
          </aside>
          <main className="min-w-0 min-h-0 border-r border-border">
            {state.activeFile ? (
              <CodeEditor
                path={state.activeFile}
                value={state.files[state.activeFile] ?? ''}
                readOnly={state.isSharedView || state.readOnly}
                onChange={(value) => dispatch({ type: 'SET_FILE', path: state.activeFile, content: value })}
                reveal={reveal}
                onSelectionChange={setAiSelection}
              />
            ) : (
              <div className="grid h-full place-content-center text-sm text-muted-foreground">
                Create a file to get started.
              </div>
            )}
          </main>
          <section className="flex min-h-0 min-w-0 flex-col bg-background">
            <Preview
              srcDoc={srcDoc}
              runKey={runKey}
              status={status}
              viewport={viewport}
              onViewportChange={setViewport}
              showViewportControls={!state.isSharedView}
            />
            <ConsolePanel entries={state.consoleEntries} onClear={clearConsole} resizable onOpenLocation={openLocation} />
          </section>
        </div>
      )}

      {showLogin && <Login onClose={() => setShowLogin(false)} onSignedIn={() => { setShowLogin(false); refreshProjects() }} />}
      {showProjects && (
        <ProjectList
          projects={projects}
          hasLocalDraft={hasLocalDraft}
          onOpen={openProject}
          onOpenLocal={() => { const d = loadLocalWorkspace(); if (d) loadFiles(d.files, d.name); conflictWarned.current = false; lastLocalWrite.current = 0; firstRunRef.current = true; setShowProjects(false) }}
          onDelete={removeProject}
          onClose={() => setShowProjects(false)}
        />
      )}
      {showShare && shareLink && state.projectId && (
        <ShareDialog link={shareLink} onClose={() => setShowShare(false)} onStopSharing={stopSharing} />
      )}
      {showImport && <ImportDialog onClose={() => setShowImport(false)} onImport={handleImport} />}
      {showDeploy && (
        <DeployDialog
          signedIn={Boolean(user)}
          onClose={() => setShowDeploy(false)}
          onLog={(level, message) => addConsole(level, message)}
        />
      )}
      {showHistory && (
        <HistoryDialog
          projectId={state.projectId}
          projectName={state.projectName}
          files={state.files}
          onRestore={restoreSnapshot}
          onClose={() => setShowHistory(false)}
        />
      )}
      {showAi && (
        <AiPanel
          signedIn={Boolean(user)}
          onSignIn={() => setShowLogin(true)}
          onClose={() => setShowAi(false)}
          selection={aiSelection}
        />
      )}
    </div>
  )
}

function MobileNavButton({
  active,
  icon,
  label,
  onClick,
  dot,
}: {
  active: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
  dot?: boolean
}) {
  return (
    <button
      className={cn(
        'relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors',
        active ? 'text-emerald-400' : 'text-muted-foreground hover:text-foreground',
      )}
      onClick={onClick}
    >
      {icon}
      {label}
      {dot && <span className="absolute right-[28%] top-2 size-1.5 rounded-full bg-red-500" />}
    </button>
  )
}