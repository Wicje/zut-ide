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
import { mudbaseEnabled } from '../lib/mudbase'
import MudbasePanel from './MudbasePanel'
import type { ConsoleLevel } from '../types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  GitBranch,
  Triangle,
  Cloud,
  CheckCircle2,
  Copy,
  Loader2,
  PlugZap,
  Link2,
  X,
  Stethoscope,
  Server,
} from 'lucide-react'
import { cn } from '@/lib/utils'

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
    <div className="mt-2 flex items-center gap-2">
      <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
      <Button onClick={copy} variant="outline" size="sm" className="shrink-0 gap-1.5">
        {copied ? <CheckCircle2 className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
        {copied ? 'Copied!' : 'Copy'}
      </Button>
    </div>
  )
}

function ConnBadge({ label, off }: { label: string; off?: boolean }) {
  return (
    <Badge variant="outline" className={cn('gap-1.5 font-normal', off ? 'text-muted-foreground' : 'text-emerald-400')}>
      <span className={cn('size-1.5 rounded-full', off ? 'bg-muted-foreground' : 'bg-emerald-400')} />
      {label}
    </Badge>
  )
}

export default function DeployDialog({ onClose, onLog, signedIn }: DeployDialogProps) {
  const { state } = useWorkspace()
  const [open, setOpen] = useState(true)
  const [connections, setConnections] = useState<ConnectionInfo[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [ghRepoName, setGhRepoName] = useState(state.projectName)
  const [ghPrivate, setGhPrivate] = useState(true)
  const [ghToken, setGhToken] = useState('')
  const [ghUseToken, setGhUseToken] = useState(false)
  const [ghResult, setGhResult] = useState<GithubPushResult | null>(null)
  const [ghError, setGhError] = useState<string | null>(null)
  const [vercelResult, setVercelResult] = useState<VercelDeployResult | null>(null)
  const [vercelToken, setVercelToken] = useState('')
  const [vercelUseToken, setVercelUseToken] = useState(false)
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

  const hasMudbase = mudbaseEnabled()
  const canCloud = hostingEnabled() && signedIn
  const hasAdvanced = hasMudbase || canCloud
  const [showAdvanced, setShowAdvanced] = useState(false)

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
      const token = ghUseToken && ghToken.trim() ? ghToken.trim() : undefined
      const result = await pushToGithub(ghRepoName.trim(), ghPrivate, state.files, token)
      if (token) setGhUseToken(false)
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

  const pushFromToken = () => {
    setBusy('github')
    handlePush()
  }

  async function handleVercel() {
    setBusy('vercel')
    setVercelError(null)
    setVercelResult(null)
    try {
      const token = vercelUseToken && vercelToken.trim() ? vercelToken.trim() : undefined
      const result = await deployToVercel(state.projectName, state.files, token)
      if (token) setVercelUseToken(false)
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

  const deployFromToken = () => {
    setBusy('vercel')
    handleVercel()
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

  function ErrorNote({ message }: { message: string | null }) {
    if (!message) return null
    return (
      <Alert variant="destructive" className="py-2">
        <AlertDescription className="text-xs">{message}</AlertDescription>
      </Alert>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) onClose() }}>
      <DialogContent className="flex h-[78vh] max-h-[700px] flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Publish project</DialogTitle>
          <DialogDescription>
            One-click live URL, no account needed. GitHub, Vercel and serverless
            targets live under Advanced and need sign-in / configuration.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="netlify" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="netlify">
              <Cloud className="mr-1.5 size-3.5" /> Netlify
            </TabsTrigger>
            {showAdvanced && hasMudbase && (
              <TabsTrigger value="mudbase">
                <Server className="mr-1.5 size-3.5" /> Serverless
              </TabsTrigger>
            )}
            {showAdvanced && canCloud && nodeProject && (
              <TabsTrigger value="node">
                <Stethoscope className="mr-1.5 size-3.5" /> Check
              </TabsTrigger>
            )}
            {showAdvanced && canCloud && (
              <TabsTrigger value="github">
                <GitBranch className="mr-1.5 size-3.5" /> GitHub
              </TabsTrigger>
            )}
            {showAdvanced && canCloud && (
              <TabsTrigger value="vercel">
                <Triangle className="mr-1.5 size-3.5" /> Vercel
              </TabsTrigger>
            )}
          </TabsList>

            {hasAdvanced && (
              <div className="px-1 pt-1">
                <button
                  className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  onClick={() => setShowAdvanced((s) => !s)}
                >
                  {showAdvanced ? 'Hide advanced targets' : 'Advanced: GitHub · Vercel · Serverless'}
                </button>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto">
              {hasMudbase && (
                <TabsContent value="mudbase">
                  <MudbasePanel files={state.files} projectName={state.projectName} onLog={onLog} />
                </TabsContent>
              )}

              {canCloud && nodeProject && (
                <TabsContent value="node">
                  <div className="grid gap-3">
                    <p className="text-sm text-muted-foreground">
                      Compile-checks your server code (
                      {nodeProject.entry ? `entry ${nodeProject.entry.entry}` : 'no entry file found'})
                      without running it. Use the GitHub push to host it on any Node platform.
                    </p>
                    <Button
                      className="w-fit"
                      onClick={handleNodeCheck}
                      disabled={!nodeProject.entry || busy === 'node-check'}
                    >
                      {busy === 'node-check' && <Loader2 className="mr-2 size-4 animate-spin" />}
                      Check server code
                    </Button>
                    <ErrorNote message={nodeError} />
                    {nodeResult && (
                      <p className="flex items-center gap-1.5 text-sm text-emerald-400">
                        <CheckCircle2 className="size-4" /> {nodeResult}
                      </p>
                    )}
                  </div>
                </TabsContent>
              )}

              <TabsContent value="github" className="grid gap-3">
                <div className="flex items-center gap-2">
                  <GitBranch className="size-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">GitHub</span>
                  <ConnBadge
                    label={
                      isConnected('github')
                        ? `Connected${login('github') ? ` as @${login('github')}` : ''}`
                        : 'Not connected'
                    }
                    off={!isConnected('github')}
                  />
                </div>

                {isConnected('github') ? (
                  <>
                    <div className="grid gap-3">
                      <div className="grid gap-1.5">
                        <Label htmlFor="gh-repo">Repo name</Label>
                        <Input
                          id="gh-repo"
                          value={ghRepoName}
                          onChange={(e) => setGhRepoName(e.target.value)}
                          placeholder="my-project"
                        />
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={ghPrivate}
                          onChange={(e) => setGhPrivate(e.target.checked)}
                          className="size-4 accent-emerald-500"
                        />
                        Private repository
                      </label>
                      <Button className="w-fit" onClick={handlePush} disabled={busy === 'github'}>
                        {busy === 'github' ? <Loader2 className="mr-2 size-4 animate-spin" /> : <GitBranch className="mr-2 size-4" />}
                        Push to GitHub
                      </Button>
                    </div>
                    <ErrorNote message={ghError} />
                    {ghResult && (
                      <>
                        <LinkResult link={ghResult.url} />
                        <p className="text-xs text-muted-foreground">
                          {ghResult.created ? 'Created' : 'Updated'} repo — branch {ghResult.defaultBranch}
                        </p>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Create a repository and push this project to your GitHub account.
                    </p>
                    <Button className="w-fit" onClick={() => connect('github')} disabled={busy === 'connect-github'}>
                      {busy === 'connect-github' ? <Loader2 className="mr-2 size-4 animate-spin" /> : <PlugZap className="mr-2 size-4" />}
                      Connect GitHub
                    </Button>
                    {!ghUseToken ? (
                      <Button variant="link" className="w-fit px-0 text-xs" onClick={() => setGhUseToken(true)}>
                        or use a GitHub token (PAT)
                      </Button>
                    ) : (
                      <div className="grid gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Input
                            className="flex-1 min-w-40"
                            type="password"
                            value={ghToken}
                            onChange={(e) => setGhToken(e.target.value)}
                            placeholder="GitHub Personal Access Token"
                          />
                          <Button
                            onClick={pushFromToken}
                            disabled={busy === 'github' || !ghToken.trim() || !ghRepoName.trim()}
                          >
                            {busy === 'github' ? <Loader2 className="mr-2 size-4 animate-spin" /> : <GitBranch className="mr-2 size-4" />}
                            Push with token
                          </Button>
                        </div>
                        <Button
                          variant="link"
                          className="w-fit px-0 text-xs text-muted-foreground"
                          onClick={() => { setGhUseToken(false); setGhToken('') }}
                        >
                          <X className="mr-1 size-3" /> Cancel
                        </Button>
                      </div>
                    )}
                    <ErrorNote message={ghError} />
                    {ghResult && <LinkResult link={ghResult.url} />}
                  </>
                )}
                {isConnected('github') && (
                  <Button
                    variant="link"
                    className="w-fit px-0 text-xs text-muted-foreground"
                    onClick={() => disconnect('github')}
                    disabled={busy === 'disconnect-github'}
                  >
                    <Link2 className="mr-1 size-3.5" /> Disconnect GitHub
                  </Button>
                )}
              </TabsContent>

              <TabsContent value="vercel" className="grid gap-3">
                <div className="flex items-center gap-2">
                  <Triangle className="size-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">Vercel</span>
                  <ConnBadge
                    label={
                      isConnected('vercel')
                        ? `Connected${login('vercel') ? ` as @${login('vercel')}` : ''}`
                        : 'Not connected'
                    }
                    off={!isConnected('vercel')}
                  />
                </div>

                {isConnected('vercel') ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Deploys “{state.projectName}” to a live <code className="rounded bg-muted px-1 font-mono text-xs">.vercel.app</code> URL.
                    </p>
                    <Button className="w-fit" onClick={handleVercel} disabled={busy === 'vercel'}>
                      {busy === 'vercel' ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Triangle className="mr-2 size-4" />}
                      Deploy to Vercel
                    </Button>
                    <ErrorNote message={vercelError} />
                    {vercelResult && <LinkResult link={vercelResult.url} />}
                  </>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Deploy this project to your Vercel account.
                    </p>
                    <Button className="w-fit" onClick={() => connect('vercel')} disabled={busy === 'connect-vercel'}>
                      {busy === 'connect-vercel' ? <Loader2 className="mr-2 size-4 animate-spin" /> : <PlugZap className="mr-2 size-4" />}
                      Connect Vercel
                    </Button>
                    {!vercelUseToken ? (
                      <Button variant="link" className="w-fit px-0 text-xs" onClick={() => setVercelUseToken(true)}>
                        or use a Vercel token
                      </Button>
                    ) : (
                      <div className="grid gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Input
                            className="flex-1 min-w-40"
                            type="password"
                            value={vercelToken}
                            onChange={(e) => setVercelToken(e.target.value)}
                            placeholder="Vercel API token"
                          />
                          <Button
                            onClick={deployFromToken}
                            disabled={busy === 'vercel' || !vercelToken.trim()}
                          >
                            {busy === 'vercel' ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Triangle className="mr-2 size-4" />}
                            Deploy with token
                          </Button>
                        </div>
                        <Button
                          variant="link"
                          className="w-fit px-0 text-xs text-muted-foreground"
                          onClick={() => { setVercelUseToken(false); setVercelToken('') }}
                        >
                          <X className="mr-1 size-3" /> Cancel
                        </Button>
                      </div>
                    )}
                    <ErrorNote message={vercelError} />
                    {vercelResult && <LinkResult link={vercelResult.url} />}
                  </>
                )}
                {isConnected('vercel') && (
                  <Button
                    variant="link"
                    className="w-fit px-0 text-xs text-muted-foreground"
                    onClick={() => disconnect('vercel')}
                    disabled={busy === 'disconnect-vercel'}
                  >
                    <Link2 className="mr-1 size-3.5" /> Disconnect Vercel
                  </Button>
                )}
              </TabsContent>

              <TabsContent value="netlify" className="grid gap-3">
                <div className="flex items-center gap-2">
                  <Cloud className="size-4 text-muted-foreground" />
                  <span className="text-sm font-semibold">Netlify</span>
                  <ConnBadge label="No account needed" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Zips the project and publishes it to a live Netlify URL.
                </p>
                <Button className="w-fit" onClick={handleNetlify} disabled={busy === 'netlify'}>
                  {busy === 'netlify' ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Cloud className="mr-2 size-4" />}
                  Deploy to Netlify
                </Button>
                <ErrorNote message={netlifyError} />
                {netlifyResult && <LinkResult link={netlifyResult} />}
              </TabsContent>
            </div>
          </Tabs>
      </DialogContent>
    </Dialog>
  )
}