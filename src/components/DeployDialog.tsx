import { useEffect, useMemo, useState } from 'react'
import { useWorkspace } from '../store/workspace'
import { deployToNetlify } from '../lib/deploy'
import {
  connectProvider,
  deployToVercel,
  disconnectConnection,
  getConnections,
  hostingEnabled,
  pushToGithub,
  type ConnectionInfo,
  type GithubPushResult,
  type VercelDeployResult,
} from '../lib/hosting'
import { checkNodeProject, findNodeEntry } from '../lib/runner'
import type { ConsoleLevel } from '../types'

interface DeployDialogProps {
  onClose: () => void
  onLog: (level: ConsoleLevel, message: string) => void
  signedIn: boolean
}

function useCopied(link: string): [boolean, () => void] {
  const [copied, setCopied] = useState(false)
  function copy() {
    if (!link) return
    navigator.clipboard
      .writeText(link)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => {
        /* clipboard unavailable */
      })
  }
  return [copied, copy]
}

function LinkResult({ link }: { link: string }) {
  const [copied, copy] = useCopied(link)
  return (
    <div className="share-link" style={{ marginTop: 8 }}>
      <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
      <button className="btn primary" onClick={copy}>{copied ? 'Copied!' : 'Copy'}</button>
    </div>
  )
}

export default function DeployDialog({ onClose, onLog, signedIn }: DeployDialogProps) {
  const { state } = useWorkspace()
  const [connections, setConnections] = useState<ConnectionInfo[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [ghRepoName, setGhRepoName] = useState(state.projectName)
  const [ghPrivate, setGhPrivate] = useState(true)
  const [ghResult, setGhResult] = useState<GithubPushResult | null>(null)
  const [ghError, setGhError] = useState<string | null>(null)
  const [vercelResult, setVercelResult] = useState<VercelDeployResult | null>(null)
  const [vercelError, setVercelError] = useState<string | null>(null)
  const [netlifyResult, setNetlifyResult] = useState<string | null>(null)
  const [netlifyError, setNetlifyError] = useState<string | null>(null)
  const [nodeResult, setNodeResult] = useState<string | null>(null)
  const [nodeError, setNodeError] = useState<string | null>(null)

  const nodeProject = useMemo(() => {
    const pkgRaw = state.files['package.json']
    if (!pkgRaw) return null
    let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } = {}
    try {
      pkg = JSON.parse(pkgRaw) as typeof pkg
    } catch {
      return null
    }
    const frameworkByDep: Record<string, string> = {
      express: 'Express',
      '@nestjs/core': 'NestJS',
      next: 'Next.js',
    }
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    const framework =
      Object.entries(frameworkByDep).find(([dep]) => deps[dep])?.[1] ?? 'Node'
    return { framework, entry: findNodeEntry(state.files) }
  }, [state.files])

  const isConnected = (p: string) => connections.some((c) => c.provider === p)
  const login = (p: string) => connections.find((c) => c.provider === p)?.login ?? null

  async function refreshConnections() {
    try {
      setConnections(await getConnections())
    } catch (e) {
      onLog('error', `Cloud services: ${(e as { message?: string }).message}`)
    }
  }

  useEffect(() => {
    if (hostingEnabled()) refreshConnections()
  }, [])

  async function connect(provider: 'github' | 'vercel') {
    setBusy(`connect-${provider}`)
    setGhError(null)
    setVercelError(null)
    try {
      await connectProvider(provider)
      await refreshConnections()
    } catch (e) {
      const msg = (e as { message?: string }).message ?? 'Connection failed'
      if (provider === 'github') setGhError(msg)
      else setVercelError(msg)
      onLog('error', `Connect ${provider}: ${msg}`)
    } finally {
      setBusy(null)
    }
  }

  async function disconnect(provider: string) {
    setBusy(`disconnect-${provider}`)
    try {
      await disconnectConnection(provider)
      setGhResult(null)
      setVercelResult(null)
      await refreshConnections()
    } catch (e) {
      onLog('error', `Disconnect: ${(e as { message?: string }).message}`)
    } finally {
      setBusy(null)
    }
  }

  async function handlePush() {
    if (!ghRepoName.trim()) return
    setBusy('github')
    setGhError(null)
    setGhResult(null)
    try {
      const result = await pushToGithub(ghRepoName.trim(), ghPrivate, state.files)
      setGhResult(result)
      onLog('info', `Pushed to ${result.url}`)
    } catch (e) {
      const msg = (e as { message?: string }).message ?? 'Push failed'
      setGhError(msg)
      onLog('error', `GitHub: ${msg}`)
    } finally {
      setBusy(null)
    }
  }

  async function handleVercel() {
    setBusy('vercel')
    setVercelError(null)
    setVercelResult(null)
    try {
      const result = await deployToVercel(state.projectName, state.files)
      setVercelResult(result)
      onLog('info', `Deployed to ${result.url}`)
    } catch (e) {
      const msg = (e as { message?: string }).message ?? 'Deploy failed'
      setVercelError(msg)
      onLog('error', `Vercel: ${msg}`)
    } finally {
      setBusy(null)
    }
  }

  async function handleNodeCheck() {
    if (!nodeProject?.entry) return
    setBusy('node-check')
    setNodeError(null)
    setNodeResult(null)
    try {
      await checkNodeProject(state.files, nodeProject.entry.entry)
      setNodeResult(`OK — ${nodeProject.framework} server bundles cleanly.`)
      onLog('info', `Server check passed (${nodeProject.entry.entry})`)
    } catch (e) {
      const msg = (e as { message?: string }).message ?? 'Check failed'
      setNodeError(msg.replace(/^BUILD_FAILED:\s*/, ''))
      onLog('error', `Server check: ${msg.replace(/^BUILD_FAILED:\s*/, '')}`)
    } finally {
      setBusy(null)
    }
  }

  async function handleNetlify() {
    setBusy('netlify')
    setNetlifyError(null)
    setNetlifyResult(null)
    try {
      const result = await deployToNetlify(state.projectName || 'project', state.files)
      setNetlifyResult(result.url)
      onLog('info', `Deployed to ${result.url}`)
    } catch (e) {
      const msg = (e as { message?: string }).message ?? 'Deploy failed'
      setNetlifyError(msg)
      onLog('error', `Netlify: ${msg}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Publish project</h2>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>

        {!hostingEnabled() && (
          <p className="share-note">
            Cloud publishing (GitHub push, Vercel deploy, AI) needs Supabase configured. See README.md.
          </p>
        )}

        {hostingEnabled() && !signedIn && (
          <p className="share-note">
            Sign in (top-right) to connect GitHub / Vercel and use the AI assistant.
          </p>
        )}

        {/* ---------- Node check ---------- */}
        {nodeProject && (
          <section className="publish-card">
            <div className="publish-head">
              <strong>{nodeProject.framework} check</strong>
              <span className="conn-badge">server code</span>
            </div>
            <p className="publish-note">
              Compile-checks your server code ({nodeProject.entry
                ? `entry ${nodeProject.entry.entry}`
                : 'no entry file found'}) without running it. Use the
              GitHub push above to host it on any Node platform.
            </p>
            <button
              className="btn primary"
              onClick={handleNodeCheck}
              disabled={!nodeProject.entry || busy === 'node-check'}
            >
              {busy === 'node-check' ? '…' : 'Check server code'}
            </button>
            {nodeError && <p className="form-error">{nodeError}</p>}
            {nodeResult && <p className="publish-note ok">{nodeResult}</p>}
          </section>
        )}

        {/* ---------- GitHub ---------- */}
        <section className="publish-card">
          <div className="publish-head">
            <strong>GitHub</strong>
            {isConnected('github') ? (
              <span className="conn-badge">Connected {login('github') ? `as @${login('github')}` : ''}</span>
            ) : (
              <span className="conn-badge off">Not connected</span>
            )}
          </div>

          {isConnected('github') ? (
            <>
              <div className="publish-row">
                <label className="publish-label">
                  Repo name
                  <input
                    className="publish-input"
                    value={ghRepoName}
                    onChange={(e) => setGhRepoName(e.target.value)}
                    placeholder="my-project"
                  />
                </label>
                <label className="publish-check">
                  <input
                    type="checkbox"
                    checked={ghPrivate}
                    onChange={(e) => setGhPrivate(e.target.checked)}
                  />
                  Private
                </label>
                <button className="btn primary" onClick={handlePush} disabled={busy === 'github'}>
                  {busy === 'github' ? '…' : 'Push to GitHub'}
                </button>
              </div>
              {ghError && <p className="form-error">{ghError}</p>}
              {ghResult && (
                <>
                  <LinkResult link={ghResult.url} />
                  <p className="publish-note">
                    {ghResult.created ? 'Created' : 'Updated'} repo — branch {ghResult.defaultBranch}
                  </p>
                </>
              )}
            </>
          ) : (
            <>
              <p className="publish-note">
                Lets you create a repository and push this project to your GitHub account.
              </p>
              <button
                className="btn primary"
                onClick={() => connect('github')}
                disabled={busy === 'connect-github'}
              >
                {busy === 'connect-github' ? '…' : 'Connect GitHub'}
              </button>
            </>
          )}
          {isConnected('github') && (
            <button
              className="link-btn"
              onClick={() => disconnect('github')}
              disabled={busy === 'disconnect-github'}
            >
              Disconnect GitHub
            </button>
          )}
        </section>

        {/* ---------- Vercel ---------- */}
        <section className="publish-card">
          <div className="publish-head">
            <strong>Vercel</strong>
            {isConnected('vercel') ? (
              <span className="conn-badge">Connected {login('vercel') ? `as @${login('vercel')}` : ''}</span>
            ) : (
              <span className="conn-badge off">Not connected</span>
            )}
          </div>

          {isConnected('vercel') ? (
            <>
              <p className="publish-note">
                Deploys “{state.projectName}” to a live <code>.vercel.app</code> URL.
              </p>
              <button className="btn primary" onClick={handleVercel} disabled={busy === 'vercel'}>
                {busy === 'vercel' ? '…' : 'Deploy to Vercel'}
              </button>
              {vercelError && <p className="form-error">{vercelError}</p>}
              {vercelResult && <LinkResult link={vercelResult.url} />}
            </>
          ) : (
            <>
              <p className="publish-note">
                Lets you deploy this project to your Vercel account.
              </p>
              <button
                className="btn primary"
                onClick={() => connect('vercel')}
                disabled={busy === 'connect-vercel'}
              >
                {busy === 'connect-vercel' ? '…' : 'Connect Vercel'}
              </button>
            </>
          )}
          {isConnected('vercel') && (
            <button
              className="link-btn"
              onClick={() => disconnect('vercel')}
              disabled={busy === 'disconnect-vercel'}
            >
              Disconnect Vercel
            </button>
          )}
        </section>

        {/* ---------- Netlify ---------- */}
        <section className="publish-card">
          <div className="publish-head">
            <strong>Netlify</strong>
            <span className="conn-badge">No account needed</span>
          </div>
          <p className="publish-note">
            Zips the project and publishes it to a live Netlify URL.
          </p>
          <button className="btn primary" onClick={handleNetlify} disabled={busy === 'netlify'}>
            {busy === 'netlify' ? '…' : 'Deploy to Netlify'}
          </button>
          {netlifyError && <p className="form-error">{netlifyError}</p>}
          {netlifyResult && <LinkResult link={netlifyResult} />}
        </section>
      </div>
    </div>
  )
}