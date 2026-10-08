import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useWorkspace } from './store/workspace'
import { CONSOLE_SOURCE, collectReferences } from './lib/runner'
import { runtimeEnabled } from './lib/runtime'
import { useRunLoop } from './hooks/useRunLoop'
import { useShortcuts } from './hooks/useShortcuts'
import { supabaseOrNull } from './lib/supabase'
import { brokerEnabled, brokerPreview } from './lib/broker'
import { getUserToken } from './lib/auth'
import { diffLines, diffStat } from './lib/aiEdits'
import { listWorkspaceSnapshots } from './lib/persistence'
import { pilotStats } from './lib/usage'
import { LIMITS } from './lib/limits'
import { useComposers } from './lib/composers'
import Sidebar from './components/Sidebar'
import { detectProjectKind, findProgramEntry } from './lib/projectKind'
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
  recoverActiveWorkspace,
  saveWorkspaceCheckpoint,
  saveWorkspaceSnapshot,
} from './lib/persistence'
import Toolbar from './components/Toolbar'
import FileExplorer from './components/FileExplorer'
import CodeEditor from './components/CodeEditor'
import RunOutput from './components/RunOutput'
import ConsolePanel from './components/ConsolePanel'
import Login from './components/Login'
import ShareDialog from './components/ShareDialog'
import ImportDialog from './components/ImportDialog'
// Heavy panels split out of the initial phone load (Monaco + editor first).
const ProjectList = lazy(() => import('./components/ProjectList'))
const DeployDialog = lazy(() => import('./components/DeployDialog'))
const HistoryDialog = lazy(() => import('./components/HistoryDialog'))
const ComposerPane = lazy(() => import('./components/ComposerPane'))
const MultiDiffViewer = lazy(() => import('./components/MultiDiffViewer'))
import StatusBar from './components/StatusBar'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Braces, ChevronDown, GitBranch, MonitorPlay, FolderOpen, Play, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { EditorSelection, FileMap } from './types'

function parseHash(): string | null {
  const m = window.location.hash.match(/^#\/p\/([\w-]+)/)
  return m ? m[1] : null
}

function hashStr(s: string): string {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/** Hash of exactly what the preview build consumes: index.html + referenced files. */
function buildSignature(files: FileMap): string {
  const html = files['index.html'] ?? ''
  let refs: string[] = []
  try {
    refs = collectReferences(html)
  } catch {
    refs = []
  }
  return ['index.html', ...refs].map((f) => `${f}#${hashStr(files[f] ?? '')}`).join('|')
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

export default function App() {
  const { state, dispatch, addConsole, clearConsole, loadFiles } = useWorkspace()
  const [user, setUser] = useState<{ email?: string | null } | null | undefined>(undefined)
  const [autoplay, setAutoplay] = useState(true)
  const [showLogin, setShowLogin] = useState(false)
  const [showProjects, setShowProjects] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [showDeploy, setShowDeploy] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  // Desktop boots with the composer pane open (3-pane layout); mobile keeps
  // the AI behind the dock button.
  const [showAi, setShowAi] = useState(() => typeof window !== 'undefined' && !window.matchMedia('(max-width: 860px)').matches)
  const [projects, setProjects] = useState<StoredRow[]>([])
  const [shareLink, setShareLink] = useState<string | null>(null)
  const [hasLocalDraft, setHasLocalDraft] = useState(false)
  const isMobile = useMediaQuery('(max-width: 860px)')
  const [mobileView, setMobileView] = useState<'code' | 'result' | 'files'>('code')
  const fileStripRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isMobile || !state.activeFile) return
    const el = fileStripRef.current?.querySelector<HTMLElement>(`[data-file="${CSS.escape(state.activeFile)}"]`)
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }, [isMobile, state.activeFile])
  const [viewport, setViewport] = useState<'auto' | number>('auto')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewAccess, setPreviewAccess] = useState<'private-token' | 'public' | null>(null)
  const [formatting, setFormatting] = useState(false)
  const [reveal, setReveal] = useState<{ token: number; line?: number; column?: number } | null>(null)
  const [aiSelection, setAiSelection] = useState<EditorSelection | null>(null)
  // Composer sessions (agents) + right-pane tab.
  const composers = useComposers()
  const [rightTab, setRightTab] = useState<'code' | 'changes'>('code')
  // Latest snapshot is the diff baseline for review + uncommitted counts.
  const [reviewBase, setReviewBase] = useState<{ id: string; files: FileMap } | null>(null)

  const sortedFiles = Object.keys(state.files).sort()
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)
  const isSwiping = useRef(false)
  const lastLocalWrite = useRef(0)
  const lastSnapshotAt = useRef(0)
  const conflictWarned = useRef(false)
  const recoveredRef = useRef(false)
  const firstRunRef = useRef(true)

  // Build-and-preview loop lives in the hook; App keeps wiring only.
  // Works without AI: plain code + Run. Web runs in the iframe preview,
  // Python/Go run on the remote runtime (see RunOutput).
  const { srcDoc, setSrcDoc, runKey, status, stage, buildMs, program, run, cancel } = useRunLoop({
    files: state.files,
    consoleEntries: state.consoleEntries,
    addConsole,
    clearConsole,
  })
  const projectKind = useMemo(() => detectProjectKind(state.files), [state.files])

  // Latest snapshot is the review baseline (refreshed per project).
  useEffect(() => {
    let cancelled = false
    void listWorkspaceSnapshots(state.projectId, state.projectName).then((snaps) => {
      if (!cancelled) setReviewBase(snaps.length ? { id: snaps[0].id, files: snaps[0].files } : null)
    })
    return () => { cancelled = true }
  }, [state.projectId, state.projectName])

  const reviewStats = useMemo(() => {
    if (!reviewBase) return null
    let added = 0
    let removed = 0
    let changedFiles = 0
    for (const f of new Set([...Object.keys(reviewBase.files), ...Object.keys(state.files)])) {
      const a = reviewBase.files[f] ?? ''
      const b = state.files[f] ?? ''
      if (a === b) continue
      changedFiles++
      const s = diffStat(diffLines(a, b))
      added += s.added
      removed += s.removed
    }
    return { added, removed, changedFiles }
  }, [reviewBase, state.files])

  const todayCount = useMemo(() => {
    try { return pilotStats().today } catch { return 0 }
  }, [state.files])

  const changedFileList = useMemo(() => {
    if (!reviewBase) return []
    const out: string[] = []
    for (const f of new Set([...Object.keys(reviewBase.files), ...Object.keys(state.files)])) {
      if ((reviewBase.files[f] ?? '') !== (state.files[f] ?? '')) out.push(f)
      if (out.length >= 50) break
    }
    return out.sort()
  }, [reviewBase, state.files])

  const lastRun = useMemo(() => {
    if (!program) return null
    const label = projectKind === 'web' ? 'preview' : `run ${findProgramEntry(state.files, projectKind) ?? projectKind}`
    return { label, exitCode: program.exitCode, durationMs: program.durationMs }
  }, [program, projectKind, state.files])

  // Remote preview URL (Cells expose) when the broker has a live dev server.
  // Null = keep local srcDoc preview. Failures are silent by design.
  useEffect(() => {
    if (!brokerEnabled() || !state.projectId || projectKind !== 'web') {
      setPreviewUrl(null)
      setPreviewAccess(null)
      return
    }
    let cancelled = false
    void getUserToken().then((token) => {
      if (cancelled || !token || !state.projectId) return
      return brokerPreview(state.projectId, token)
        .then((p) => {
          if (cancelled) return
          setPreviewUrl(p.url ?? null)
          setPreviewAccess(p.access ?? null)
        })
        .catch(() => {
          if (!cancelled) {
            setPreviewUrl(null)
            setPreviewAccess(null)
          }
        })
    })
    return () => {
      cancelled = true
    }
  }, [state.projectId, projectKind])

  const openLocation = useCallback(
    (file: string, line?: number, column?: number) => {
      if (!(file in state.files)) return
      dispatch({ type: 'SET_ACTIVE', path: file })
      setMobileView('code')
      setReveal({ token: Date.now(), line, column })
    },
    [dispatch, state.files],
  )

  // Latest-callback refs so timers/shortcuts never invoke stale closures.
  const runRef = useRef(run)
  runRef.current = run

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

  // Rebuild only when the build inputs change (index.html + referenced
  // files) — editing notes.txt or data.json no longer rebundles.
  // Programs (Python/Go) run manually so every keystroke doesn't bill the
  // remote runtime. runRef always points at the latest run().
  const buildSig = useMemo(() => buildSignature(state.files), [state.files])
  useEffect(() => {
    if (!autoplay) return
    if (Object.keys(state.files).length === 0) return
    if (projectKind !== 'web') return
    const t = setTimeout(() => void runRef.current(), 900)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildSig, autoplay, projectKind])

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
    // Pre-wipe checkpoint: the outgoing workspace is recoverable from History.
    if (Object.keys(state.files).length > 0) {
      void saveWorkspaceCheckpoint(state.projectId, state.projectName, state.files)
      addConsole('info', `Checkpointed "${state.projectName}" — History can restore it.`)
    }
    setShareLink(null); setSrcDoc('')
    if (parseHash()) history.replaceState(null, '', window.location.pathname)
    dispatch({ type: 'SET_PROJECT_ID', id: null })
    conflictWarned.current = false
    lastLocalWrite.current = 0
    firstRunRef.current = true
    loadFiles(files, name)
    addConsole('info', `Created "${name}" with ${Object.keys(files).length} files. Press Run to preview.`)
  }

  // IDE shortcuts (listener lives in the hook; handlers stay fresh via ref).
  useShortcuts({
    onRun: () => void runRef.current(),
    onSave: () => void save(),
    onToggleAi: () => setShowAi((v) => !v),
  })

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

  function remixShared() {
    if (!state.isSharedView) return
    history.replaceState(null, '', window.location.pathname)
    conflictWarned.current = false
    lastLocalWrite.current = 0
    firstRunRef.current = true
    const name = state.projectName.endsWith(' (remix)') ? state.projectName : `${state.projectName} (remix)`
    loadFiles({ ...state.files }, name)
    addConsole('info', 'Remixed into your own editable copy. Press Run to preview.')
  }

  async function share() {
    if (state.isSharedView || state.readOnly) return
    if (!user) {
      addConsole('info', 'Sign in to share a read-only link to this project.')
      return
    }
    try {
      // No dead end: a first-time share saves to the cloud automatically.
      let id = state.projectId
      if (!id) {
        id = await createProject(state.projectName, state.files)
        dispatch({ type: 'SET_PROJECT_ID', id })
        dispatch({ type: 'SET_SAVED', saved: true })
        refreshProjects()
        addConsole('info', 'Saved to cloud.')
      }
      if (shareLink) { setShowShare(true); return }
      const token = await setProjectShared(id, true)
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
      if (['py', 'go'].includes(ext)) {
        addConsole('info', 'Formatting Python/Go is not built in yet — your code runs as-is.')
        return
      }
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
    if (Object.keys(state.files).length > 0) {
      void saveWorkspaceCheckpoint(state.projectId, state.projectName, state.files)
    }
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

  const composerPane = (
    <Suspense fallback={null}>
      <ComposerPane
        key={composers.activeId}
        composers={composers}
        signedIn={Boolean(user)}
        onSignIn={() => setShowLogin(true)}
        onClose={() => setShowAi(false)}
        selection={aiSelection}
        reviewAdded={reviewStats?.added ?? 0}
        reviewRemoved={reviewStats?.removed ?? 0}
        changedFiles={changedFileList}
        lastRun={lastRun}
        onOpenFile={openLocation}
        onCommitPush={() => void handleCommitPush()}
        onLog={(level, message) => addConsole(level, message)}
      />
    </Suspense>
  )

  async function handleCommitPush() {
    await save()
    setShowDeploy(true)
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      {isMobile && (
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
        onRemix={remixShared}
        shareLink={canShare ? shareLink : null}
        onFormat={formatActive}
        onDeploy={handleDeploy}
        onHistory={() => setShowHistory(true)}
        onOpenAi={() => setShowAi((v) => !v)}
        onImport={() => setShowImport(true)}
        formatting={formatting}
        isMobile={isMobile}
      />
      )}

      {!supabaseOrNull() && (
        <div className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700">
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
                <RunOutput
                  kind={projectKind}
                  srcDoc={srcDoc}
                  runKey={runKey}
                  status={status}
                  stage={stage}
                  program={program}
                  previewUrl={previewUrl}
                  previewAccess={previewAccess}
                  onRun={() => void run()}
                  onRunProgram={(stdin) => void run(undefined, stdin)}
                  onCancel={cancel}
                />
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
        <div
          className="grid min-h-0 flex-1"
          style={{ gridTemplateColumns: showAi ? '280px minmax(360px,420px) minmax(0,1fr)' : '280px minmax(0,1fr)' }}
        >
          {/* Left: agents + files + identity */}
          <aside className="min-h-0 border-r border-border/70 bg-sidebar">
            <Sidebar
              sessions={composers.sessions}
              activeSessionId={composers.activeId}
              onSelectSession={composers.select}
              onNewSession={composers.create}
              onRemoveSession={composers.remove}
              user={user}
              todayCount={todayCount}
              dailyCap={LIMITS.dailyRunCap}
              actions={{
                onRun: () => void run(),
                onFormat: formatActive,
                onSave: save,
                onDownload: download,
                onNewProject: newProject,
                onImport: () => setShowImport(true),
                onOpenProjects: openProjects,
                onOpenHistory: () => setShowHistory(true),
                onToggleComposer: () => setShowAi((v) => !v),
                onLogin: () => setShowLogin(true),
                onLogout: logout,
              }}
            />
          </aside>

          {/* Center: composer */}
          {showAi && (
            <section className="flex min-h-0 min-w-0 flex-col border-r border-border/70">
              {composerPane}
            </section>
          )}

          {/* Right: SCM bar + tabs + code/changes + output */}
          <div className="flex min-h-0 min-w-0 flex-col bg-background">
            <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-border/70 bg-card px-3">
              <button
                className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-[13px] text-foreground/90 transition-colors hover:bg-muted"
                onClick={openProjects}
                title="Projects — switch workspace"
              >
                <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate font-medium">{state.projectName}</span>
                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
              </button>
              {reviewStats && reviewStats.changedFiles > 0 && (
                <span
                  className="shrink-0 rounded-full border border-border/70 bg-muted/40 px-2 py-0.5 font-mono text-[11px]"
                  title={`${reviewStats.changedFiles} files uncommitted vs last snapshot`}
                >
                  <span className="text-emerald-600">+{reviewStats.added}</span>{' '}
                  <span className="text-red-600">-{reviewStats.removed}</span>
                </span>
              )}
              <span className="ml-auto flex shrink-0 items-center gap-1.5">
                <button
                  className="grid size-7 place-content-center rounded-md text-emerald-600 transition-colors hover:bg-emerald-500/10"
                  onClick={() => void run()}
                  title="Run (Ctrl+Enter)"
                  aria-label="Run"
                >
                  <Play className="size-3.5 fill-current" />
                </button>
                <Button variant="outline" size="sm" onClick={share} title="Share a read-only review link">
                  Create PR
                </Button>
                <Button size="sm" onClick={() => void handleCommitPush()} title="Save to cloud, then open publish options">
                  Commit &amp; Push
                </Button>
              </span>
            </div>
            <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border/70 bg-card px-2 text-xs">
              <button
                className={cn(
                  'rounded-md px-2.5 py-1 font-mono transition-colors',
                  rightTab === 'code' ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => setRightTab('code')}
              >
                {state.activeFile || 'No file'}
              </button>
              <button
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1 transition-colors',
                  rightTab === 'changes' ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
                onClick={() => setRightTab('changes')}
              >
                Changes
                {reviewStats && reviewStats.changedFiles > 0 && (
                  <span className="rounded-full bg-muted px-1.5 font-mono text-[10px]">{reviewStats.changedFiles}</span>
                )}
              </button>
            </div>
            <div className="min-h-0 flex-[3] border-b border-border/70">
              {rightTab === 'changes' ? (
                reviewBase ? (
                  <Suspense fallback={null}>
                    <MultiDiffViewer base={reviewBase.files} current={state.files} focusFile={state.activeFile} />
                  </Suspense>
                ) : (
                  <div className="grid h-full place-content-center px-6 text-center text-sm text-muted-foreground">
                    No snapshot yet — keep editing, autosnapshots land every ~30s.
                  </div>
                )
              ) : state.activeFile ? (
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
            </div>
            <div className="flex min-h-[180px] flex-[2] flex-col">
              <RunOutput
                kind={projectKind}
                srcDoc={srcDoc}
                runKey={runKey}
                status={status}
                stage={stage}
                program={program}
                previewUrl={previewUrl}
                previewAccess={previewAccess}
                viewport={viewport}
                onViewportChange={setViewport}
                showViewportControls={!state.isSharedView}
                onRun={() => void run()}
                onRunProgram={(stdin) => void run(undefined, stdin)}
                onCancel={cancel}
              />
              <ConsolePanel entries={state.consoleEntries} onClear={clearConsole} resizable onOpenLocation={openLocation} />
            </div>
          </div>
        </div>
      )}

      {!isMobile && (
        <StatusBar
          status={status}
          stage={stage}
          buildMs={buildMs}
          savedTo={user && state.projectId && !state.isSharedView ? 'cloud' : 'device'}
          saved={state.saved}
          projectName={state.projectName}
          fileCount={Object.keys(state.files).length}
          activeFile={state.activeFile}
          errorCount={state.consoleEntries.filter((e) => e.level === 'error').length}
          cloudBuild={runtimeEnabled()}
          aiTouched={state.aiTouched}
        />
      )}

      {showLogin && <Login onClose={() => setShowLogin(false)} onSignedIn={() => { setShowLogin(false); refreshProjects() }} />}
      {showProjects && (
        <Suspense fallback={null}>
          <ProjectList
            projects={projects}
            hasLocalDraft={hasLocalDraft}
            onOpen={openProject}
            onOpenLocal={() => { const d = loadLocalWorkspace(); if (d) loadFiles(d.files, d.name); conflictWarned.current = false; lastLocalWrite.current = 0; firstRunRef.current = true; setShowProjects(false) }}
            onDelete={removeProject}
            onClose={() => setShowProjects(false)}
          />
        </Suspense>
      )}
      {showShare && shareLink && state.projectId && (
        <ShareDialog link={shareLink} onClose={() => setShowShare(false)} onStopSharing={stopSharing} />
      )}
      {showImport && <ImportDialog onClose={() => setShowImport(false)} onImport={handleImport} />}
      {showDeploy && (
        <Suspense fallback={null}>
          <DeployDialog
            signedIn={Boolean(user)}
            onClose={() => setShowDeploy(false)}
            onLog={(level, message) => addConsole(level, message)}
          />
        </Suspense>
      )}
      {showHistory && (
        <Suspense fallback={null}>
          <HistoryDialog
            projectId={state.projectId}
            projectName={state.projectName}
            files={state.files}
            onRestore={restoreSnapshot}
            onClose={() => setShowHistory(false)}
          />
        </Suspense>
      )}
      {showAi && isMobile && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
          {composerPane}
        </div>
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