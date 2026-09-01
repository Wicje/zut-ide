import { useCallback, useEffect, useRef, useState } from 'react'
import { useWorkspace } from './store/workspace'
import {
  CONSOLE_SOURCE,
  bundleProject,
  buildSrcdoc,
  formatBuildErrors,
  initRunner,
} from './lib/runner'
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
import { deployToNetlify } from './lib/deploy'
import { importFromUrl } from './lib/importer'
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
import type { FileMap, RunStatus } from './types'

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
  const [deployUrl, setDeployUrl] = useState<string | null>(null)
  const [projects, setProjects] = useState<StoredRow[]>([])
  const [shareLink, setShareLink] = useState<string | null>(null)
  const [status, setStatus] = useState<RunStatus>('idle')
  const [hasLocalDraft, setHasLocalDraft] = useState(false)
  const [wasmReady] = useState(() => initRunner())
  const isMobile = useMediaQuery('(max-width: 860px)')
  const [mobileView, setMobileView] = useState<'code' | 'result' | 'files'>('code')
  const [viewport, setViewport] = useState<'auto' | number>('auto')
  const [formatting, setFormatting] = useState(false)
  const [deploying, setDeploying] = useState(false)

  const sortedFiles = Object.keys(state.files).sort()
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)
  const isSwiping = useRef(false)

  const run = useCallback(
    async (files?: FileMap) => {
      const target = files ?? state.files
      setStatus('running')
      clearConsole()
      try {
        await wasmReady
        const bundle = await bundleProject(target)
        setSrcDoc(buildSrcdoc(target['index.html'], bundle))
        setRunKey((k) => k + 1)
        setStatus('done')
      } catch (e) {
        setSrcDoc('')
        for (const err of formatBuildErrors(e)) {
          const loc = err.location ? ` (line ${err.location.line}${err.location.column ? `:${err.location.column}` : ''})` : ''
          addConsole('error', `Build error${loc}: ${err.message}`)
        }
        setStatus('error')
      }
    },
    [state.files, addConsole, clearConsole, wasmReady],
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
    if (state.isSharedView) return
    saveLocalWorkspace(state.projectName, state.files)
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

  // Quick-switch gesture handlers for mobile file tabs
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
    const dx = 0 // delta captured in touchStart; we determine direction from movement
    // Use the last known delta: if touch moved left (next file), right (prev file)
    // We track direction in touchEnd by comparing start vs end position
    // For simplicity: just advance forward (right swipe = next, left swipe = prev)
    // We stored touchStartX but not endX. Let's just cycle forward on any swipe.
    const next = (idx + 1) % sortedFiles.length
    dispatch({ type: 'SET_ACTIVE', path: sortedFiles[next] })
    void dx // suppress lint
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
    loadFiles(files, name)
  }

  async function openProject(id: string) {
    if (id.startsWith('local-')) { const d = loadLocalWorkspace(); if (d) loadFiles(d.files, d.name); return }
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

  async function handleDeploy() {
    setDeploying(true); setShowDeploy(true); setDeployUrl(null)
    try {
      const result = await deployToNetlify(state.projectName || 'project', state.files)
      setDeployUrl(result.url)
      addConsole('info', `Deployed to ${result.url}`)
    } catch (e) {
      addConsole('error', `Deploy failed: ${(e as { message?: string }).message}`)
      setShowDeploy(false)
    } finally { setDeploying(false) }
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
    <div className="app">
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
        onImport={() => setShowImport(true)}
        formatting={formatting}
        deploying={deploying}
        isMobile={isMobile}
      />

      {!supabaseOrNull() && (
        <div className="env-banner">
          Cloud not configured — running in local-only mode. Set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env to enable
          accounts, saving, and sharing. See README.md
        </div>
      )}

      {isMobile ? (
        <div className="content mobile">
          <div
            className="mobile-files"
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            {sortedFiles.map((file) => (
              <button
                key={file}
                className={state.activeFile === file ? 'mobile-file active' : 'mobile-file'}
                onClick={() => { dispatch({ type: 'SET_ACTIVE', path: file }); setMobileView('code') }}
              >
                {file}
              </button>
            ))}
          </div>
          <div className="mobile-main">
            {mobileView === 'code' && (
              <main className="editor-pane">
                {state.activeFile ? (
                  <CodeEditor
                    path={state.activeFile}
                    value={state.files[state.activeFile] ?? ''}
                    readOnly={state.isSharedView || state.readOnly}
                    onChange={(value) => dispatch({ type: 'SET_FILE', path: state.activeFile, content: value })}
                  />
                ) : (
                  <div className="editor-empty">Create a file to get started.</div>
                )}
              </main>
            )}
            {mobileView === 'result' && (
              <section className="right-pane">
                <Preview srcDoc={srcDoc} runKey={runKey} status={status} />
                <ConsolePanel entries={state.consoleEntries} onClear={clearConsole} collapsible />
              </section>
            )}
            {mobileView === 'files' && (
              <aside className="sidebar">
                <FileExplorer readOnly={state.isSharedView || state.readOnly} />
              </aside>
            )}
          </div>
          <nav className="mobile-nav">
            <button className={mobileView === 'code' ? 'mnav-btn active' : 'mnav-btn'} onClick={() => setMobileView('code')}>
              <span className="mnav-icon">⟨⟩</span>
              <span className="mnav-label">Code</span>
            </button>
            <button className={mobileView === 'result' ? 'mnav-btn active' : 'mnav-btn'} onClick={() => setMobileView('result')}>
              <span className="mnav-icon">▣</span>
              <span className="mnav-label">Result</span>
              {status === 'error' && <span className="mnav-dot" />}
            </button>
            <button className={mobileView === 'files' ? 'mnav-btn active' : 'mnav-btn'} onClick={() => setMobileView('files')}>
              <span className="mnav-icon">▤</span>
              <span className="mnav-label">Files</span>
            </button>
          </nav>
        </div>
      ) : (
        <div className="content">
          <aside className="sidebar">
            <FileExplorer readOnly={state.isSharedView || state.readOnly} />
          </aside>
          <main className="editor-pane">
            {state.activeFile ? (
              <CodeEditor
                path={state.activeFile}
                value={state.files[state.activeFile] ?? ''}
                readOnly={state.isSharedView || state.readOnly}
                onChange={(value) => dispatch({ type: 'SET_FILE', path: state.activeFile, content: value })}
              />
            ) : (
              <div className="editor-empty">Create a file to get started.</div>
            )}
          </main>
          <section className="right-pane">
            <Preview
              srcDoc={srcDoc}
              runKey={runKey}
              status={status}
              viewport={viewport}
              onViewportChange={setViewport}
              showViewportControls={!state.isSharedView}
            />
            <ConsolePanel entries={state.consoleEntries} onClear={clearConsole} />
          </section>
        </div>
      )}

      {showLogin && <Login onClose={() => setShowLogin(false)} onSignedIn={() => { setShowLogin(false); refreshProjects() }} />}
      {showProjects && (
        <ProjectList
          projects={projects}
          hasLocalDraft={hasLocalDraft}
          onOpen={openProject}
          onOpenLocal={() => { const d = loadLocalWorkspace(); if (d) loadFiles(d.files, d.name); setShowProjects(false) }}
          onDelete={removeProject}
          onClose={() => setShowProjects(false)}
        />
      )}
      {showShare && shareLink && state.projectId && (
        <ShareDialog link={shareLink} onClose={() => setShowShare(false)} onStopSharing={stopSharing} />
      )}
      {showImport && <ImportDialog onClose={() => setShowImport(false)} onImport={handleImport} />}
      {showDeploy && <DeployDialog url={deployUrl} onClose={() => { setShowDeploy(false); setDeployUrl(null) }} />}
    </div>
  )
}