import { useEffect, useState } from 'react'
import { useWorkspace } from '../store/workspace'
import {
  emptyProject,
  javascriptStarter,
  typescriptStarter,
  reactStarter,
  vueStarter,
  nextStarter,
  expressStarter,
  nestStarter,
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
  onOpenAi: () => void
  onImport: () => void
  formatting: boolean
  isMobile: boolean
  shareLink: string | null
}

const NEW_PROJECTS = [
  { label: 'Empty project', name: 'my-project', files: () => emptyProject() },
  { label: 'JavaScript playground', name: 'js-playground', files: () => javascriptStarter() },
  { label: 'TypeScript playground', name: 'ts-playground', files: () => typescriptStarter() },
  { label: 'React', name: 'react-app', files: () => reactStarter() },
  { label: 'Vue', name: 'vue-app', files: () => vueStarter() },
  { label: 'Next.js (deploy to Vercel)', name: 'next-app', files: () => nextStarter() },
  { label: 'Express API', name: 'express-api', files: () => expressStarter() },
  { label: 'NestJS API', name: 'nestjs-api', files: () => nestStarter() },
] as const

export default function Toolbar(props: ToolbarProps) {
  const { state, dispatch } = useWorkspace()
  const [nameInput, setNameInput] = useState(state.projectName)

  useEffect(() => setNameInput(state.projectName), [state.projectName])

  const editable = !state.isSharedView && !state.readOnly

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b bg-background/80 px-2 backdrop-blur md:gap-2 md:px-3">
      {/* Left: logo + project name */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="flex select-none items-center gap-1 rounded-md border bg-muted px-1.5 py-0.5 font-mono text-sm font-bold tracking-tight text-foreground">
          <span className="text-emerald-400">~</span>zut
        </span>
        {state.isSharedView ? (
          <Badge variant="outline" className="shrink-0 gap-1.5">
            <Globe className="size-3" /> shared view · read-only
          </Badge>
        ) : (
          <>
            <Input
              className="h-8 w-40 border-transparent bg-transparent font-medium focus-visible:bg-muted/60 md:w-56"
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <Plus className="mr-1 size-4" /> New
                  <ChevronDown className="ml-1 size-3.5 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-60">
                <DropdownMenuLabel>New project</DropdownMenuLabel>
                {NEW_PROJECTS.map((p) => (
                  <DropdownMenuItem key={p.label} onSelect={() => props.onNewProject(p.files(), p.name)}>
                    <FilePlus2 className="mr-2 size-4 text-muted-foreground" />
                    {p.label}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={props.onImport}>
                  <Globe className="mr-2 size-4 text-muted-foreground" />
                  Import from URL…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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

        <Button size="sm" className="gap-1.5 bg-emerald-600 text-white hover:bg-emerald-500" onClick={props.onRun}>
          <Play className="size-3.5 fill-current" />
          <span className="hidden sm:inline">Run</span>
        </Button>

        {editable && (
          <>
            <Button variant="ghost" size="sm" onClick={props.onSave}>
              <Save className="size-4 md:mr-1.5" />
              <span className="hidden md:inline">Save</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={props.onFormat} disabled={props.formatting}>
              {props.formatting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4 md:mr-1.5" />
              )}
              <span className="hidden md:inline">Format</span>
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
              disabled={!props.shareLink && !state.projectId}
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