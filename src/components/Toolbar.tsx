import { useEffect, useState } from 'react'
import { useWorkspace } from '../store/workspace'
import {
  emptyProject,
  javascriptStarter,
  typescriptStarter,
  reactStarter,
  vueStarter,
} from '../lib/templates'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Separator } from '@/components/ui/separator'
import {
  Play,
  Save,
  Download,
  Share2,
  FolderOpen,
  Rocket,
  Sparkles,
  ChevronDown,
  Loader2,
  Plus,
  LogOut,
  CircleUser,
  FilePlus2,
  Globe,
  History,
  Paintbrush,
} from 'lucide-react'
import { cn } from '@/lib/utils'

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
  onHistory: () => void
  onOpenAi: () => void
  onImport: () => void
  onRemix?: () => void
  formatting: boolean
  isMobile: boolean
  shareLink: string | null
}

const STARTERS = [
  {
    label: 'JavaScript playground',
    desc: 'Single script.js, console-first',
    name: 'js-playground',
    files: () => javascriptStarter(),
  },
  {
    label: 'TypeScript playground',
    desc: 'Typed script.ts with checking',
    name: 'ts-playground',
    files: () => typescriptStarter(),
  },
] as const

const FRAMEWORKS = [
  {
    label: 'React + Router + TanStack',
    desc: 'App shell, live preview',
    name: 'react-app',
    files: () => reactStarter(),
  },
  {
    label: 'Vue',
    desc: 'Single-file components',
    name: 'vue-app',
    files: () => vueStarter(),
  },
] as const

export default function Toolbar(props: ToolbarProps) {
  const { state, dispatch } = useWorkspace()
  const [nameInput, setNameInput] = useState(state.projectName)

  useEffect(() => setNameInput(state.projectName), [state.projectName])

  const editable = !state.isSharedView && !state.readOnly

  // Blank-first: one click = minimal index.html + CSS + JS canvas.
  // Devs add whatever files they need via the explorer +. Starters live
  // behind the chevron for those who want a head start.
  function newBlank() {
    if (!state.saved && Object.keys(state.files).length > 0) {
      if (!window.confirm('Start a new blank project? Unsaved changes will be lost.')) return
    }
    props.onNewProject(emptyProject(), 'my-project')
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b bg-background/80 px-2 backdrop-blur md:gap-2 md:px-3">
      {/* Left: logo + project name */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="flex select-none items-center gap-1 rounded-md border bg-muted px-1.5 py-0.5 font-mono text-sm font-bold tracking-tight text-foreground">
          <span className="text-emerald-400">~</span>zut
        </span>
        {state.isSharedView ? (
          <>
            <Badge variant="outline" className="shrink-0 gap-1.5">
              <Globe className="size-3" /> shared view · read-only
            </Badge>
            {props.onRemix && (
              <Button
                size="sm"
                className="shrink-0 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-500"
                onClick={props.onRemix}
                title="Make your own editable copy of this project"
              >
                <Plus className="size-3.5" />
                <span className="hidden sm:inline">Remix in zut</span>
                <span className="sm:hidden">Remix</span>
              </Button>
            )}
          </>
        ) : (
          <>
            <Input
              className="h-8 w-28 min-w-0 border-transparent bg-transparent font-medium focus-visible:bg-muted/60 sm:w-40 md:w-56"
              value={nameInput}
              placeholder="Project name"
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={() => dispatch({ type: 'SET_NAME', name: nameInput || 'untitled' })}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
            <span
              className={cn(
                'hidden shrink-0 items-center gap-1.5 text-xs md:inline-flex',
                state.saved ? 'text-muted-foreground' : 'text-amber-400',
              )}
            >
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  state.saved ? 'bg-muted-foreground/50' : 'bg-amber-400',
                )}
              />
              {state.saved ? 'saved' : 'unsaved'}
            </span>
          </>
        )}
      </div>

      {/* Right: actions */}
      <div className="flex shrink-0 items-center gap-1 md:gap-1.5">
        {editable && (
          <>
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="sm"
                className="rounded-r-none pr-1.5"
                onClick={newBlank}
                title="New blank project (minimal HTML + CSS + JS)"
              >
                <Plus className="mr-1 size-4" /> New
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-l-none px-1"
                    title="Start from a starter instead"
                    aria-label="More project starters"
                  >
                    <ChevronDown className="size-3.5 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                  <DropdownMenuLabel>Starters (optional)</DropdownMenuLabel>
                  {STARTERS.map((p) => (
                    <DropdownMenuItem key={p.label} onSelect={() => props.onNewProject(p.files(), p.name)}>
                      <FilePlus2 className="mr-2 size-4 shrink-0 text-muted-foreground" />
                      <span className="flex min-w-0 flex-col">
                        <span>{p.label}</span>
                        <span className="truncate text-[11px] text-muted-foreground">{p.desc}</span>
                      </span>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Frameworks</DropdownMenuLabel>
                  {FRAMEWORKS.map((p) => (
                    <DropdownMenuItem key={p.label} onSelect={() => props.onNewProject(p.files(), p.name)}>
                      <FilePlus2 className="mr-2 size-4 shrink-0 text-muted-foreground" />
                      <span className="flex min-w-0 flex-col">
                        <span>{p.label}</span>
                        <span className="truncate text-[11px] text-muted-foreground">{p.desc}</span>
                      </span>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={props.onImport}>
                    <Globe className="mr-2 size-4 shrink-0 text-muted-foreground" />
                    <span className="flex min-w-0 flex-col">
                      <span>Import from URL…</span>
                      <span className="truncate text-[11px] text-muted-foreground">HTML page, CodePen, GitHub raw</span>
                    </span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={props.onOpenProjects}
            >
              <FolderOpen className="mr-1.5 size-4" /> Projects
            </Button>
          </>
        )}

        {!props.isMobile && (
          <label className="hidden items-center gap-2 px-2 text-xs text-muted-foreground lg:inline-flex">
            <span>Auto-run</span>
            <Switch checked={props.autoplay} onCheckedChange={props.onToggleAutoplay} />
          </label>
        )}

        <Separator orientation="vertical" className="mx-1 h-5" />

        <Button size="sm" className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-500" onClick={props.onRun} title="Run preview (Ctrl+Enter)">
          <Play className="size-3.5 fill-current" />
          <span className="hidden sm:inline">Run</span>
        </Button>

        {editable && (
          <>
            <Button variant="ghost" size="sm" onClick={props.onSave} title="Save (Ctrl+S)">
              <Save className="size-4 md:mr-1.5" />
              <span className="hidden md:inline">Save</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={props.onFormat} disabled={props.formatting} title="Format active file (Prettier)">
              {props.formatting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Paintbrush className="size-4 md:mr-1.5" />
              )}
              <span className="hidden md:inline">Format</span>
            </Button>
            <Button variant="ghost" size="sm" title="Version history" onClick={props.onHistory}>
              <History className="size-4" />
              <span className="sr-only">Version history</span>
            </Button>
            {!props.isMobile && (
              <Button variant="ghost" size="sm" onClick={props.onDownload}>
                <Download className="size-4 md:mr-1.5" />
                <span className="hidden md:inline">ZIP</span>
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={props.onDeploy}>
              <Rocket className="size-4 md:mr-1.5" />
              <span className="hidden md:inline">Deploy</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={props.onShare}
              disabled={!props.user}
              title={props.user ? 'Share a read-only link (saves to cloud first)' : 'Sign in to share'}
            >
              <Share2 className="size-4 md:mr-1.5" />
              <span className="hidden md:inline">Share</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="hidden gap-1.5 sm:inline-flex"
              onClick={props.onOpenAi}
            >
              <Sparkles className="size-4 text-violet-400" /> AI
            </Button>
          </>
        )}

        {props.user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5">
                <CircleUser className="size-4" />
                <span className="hidden max-w-28 truncate font-normal sm:inline">
                  {props.user.email ?? 'Account'}
                </span>
                <ChevronDown className="size-3.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="truncate">{props.user.email ?? 'Signed in'}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={props.onLogout}>
                <LogOut className="mr-2 size-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button variant="outline" size="sm" onClick={props.onLogin}>
            <CircleUser className="mr-1.5 size-4" />
            <span className="hidden sm:inline">Sign in</span>
          </Button>
        )}
      </div>
    </header>
  )
}