import { useMemo, useState } from 'react'
import { useWorkspace } from '../store/workspace'
import type { ComposerSession } from '../lib/composers'
import {
  emptyProject,
  reactStarter,
  vueStarter,
  pythonStarter,
  goStarter,
} from '../lib/templates'
import type { FileMap } from '../types'
import FileExplorer from './FileExplorer'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Plus,
  Zap,
  SlidersHorizontal,
  History,
  Search,
  X,
  Settings,
  LogOut,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SidebarActions {
  onRun: () => void
  onFormat: () => void
  onSave: () => void
  onDownload: () => void
  onNewProject: (files: FileMap, name: string) => void
  onImport: () => void
  onOpenProjects: () => void
  onOpenHistory: () => void
  onToggleComposer: () => void
  onLogin: () => void
  onLogout: () => void
}

interface SidebarProps {
  sessions: ComposerSession[]
  activeSessionId: string
  onSelectSession: (id: string) => void
  onNewSession: () => void
  onRemoveSession: (id: string) => void
  user: { email?: string | null } | null | undefined
  todayCount: number
  dailyCap: number
  actions: SidebarActions
}

function initials(email?: string | null): string {
  if (!email) return '··'
  const head = email.split('@')[0].replace(/[^a-zA-Z]/g, '')
  return (head.slice(0, 2) || '··').toUpperCase()
}

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (s < 60) return 'now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export default function Sidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onRemoveSession,
  user,
  todayCount,
  dailyCap,
  actions,
}: SidebarProps) {
  const { state } = useWorkspace()
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const filteredSessions = useMemo(
    () => (q ? sessions.filter((s) => s.title.toLowerCase().includes(q)) : sessions),
    [sessions, q],
  )
  const fileFilter = q || undefined

  return (
    <div className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
      {/* Traffic lights + search */}
      <div className="flex shrink-0 items-center gap-2 px-3 pt-3">
        <span className="flex items-center gap-1.5" aria-hidden>
          <span className="size-3 rounded-full bg-[#ff5f57] ring-1 ring-black/10" />
          <span className="size-3 rounded-full bg-[#febc2e] ring-1 ring-black/10" />
          <span className="size-3 rounded-full bg-[#28c840] ring-1 ring-black/10" />
        </span>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search agents & files…"
            className="h-7 bg-muted/60 pl-7 pr-6 text-xs"
            aria-label="Search agents and files"
          />
          {query && (
            <button
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
              onClick={() => setQuery('')}
              aria-label="Clear search"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 flex-col gap-1 px-3 pt-2.5">
        <Button size="sm" className="w-full justify-start gap-1.5" onClick={onNewSession} title="Start a new agent conversation">
          <Plus className="size-4" /> New Agent
          <kbd className="ml-auto hidden rounded bg-muted px-1 font-mono text-[10px] text-muted-foreground lg:inline">⌘N</kbd>
        </Button>
        <div className="flex gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="flex-1 justify-start gap-1.5 text-muted-foreground" title="Run, format, starters">
                <Zap className="size-3.5" /> Automations
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>Run this project</DropdownMenuLabel>
              <DropdownMenuItem onSelect={actions.onRun}>▶ Run (Ctrl+Enter)</DropdownMenuItem>
              <DropdownMenuItem onSelect={actions.onFormat}>Format active file</DropdownMenuItem>
              <DropdownMenuItem onSelect={actions.onSave}>Save</DropdownMenuItem>
              <DropdownMenuItem onSelect={actions.onDownload}>Download ZIP</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Start from…</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => actions.onNewProject(emptyProject(), 'my-project')}>Blank canvas</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => actions.onNewProject(reactStarter(), 'react-app')}>React app</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => actions.onNewProject(vueStarter(), 'vue-app')}>Vue app</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => actions.onNewProject(pythonStarter(), 'python-app')}>Python</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => actions.onNewProject(goStarter(), 'go-app')}>Go</DropdownMenuItem>
              <DropdownMenuItem onSelect={actions.onImport}>Import from URL…</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="flex-1 justify-start gap-1.5 text-muted-foreground" title="Views and account">
                <SlidersHorizontal className="size-3.5" /> Customize
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <DropdownMenuItem onSelect={actions.onToggleComposer}>Toggle composer (Ctrl+K)</DropdownMenuItem>
              <DropdownMenuItem onSelect={actions.onOpenProjects}>Projects…</DropdownMenuItem>
              <DropdownMenuItem onSelect={actions.onOpenHistory}>History…</DropdownMenuItem>
              <DropdownMenuSeparator />
              {user ? (
                <DropdownMenuItem onSelect={actions.onLogout}>Sign out{user.email ? ` (${user.email})` : ''}</DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={actions.onLogin}>Sign in…</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Groups */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="px-1.5 py-2">
          <div className="px-1.5 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Agents
          </div>
          <ul className="flex flex-col gap-px">
            {filteredSessions.map((s) => {
              const active = s.id === activeSessionId
              return (
                <li key={s.id} className="group relative">
                  <button
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors',
                      active ? 'bg-accent font-medium text-accent-foreground' : 'text-foreground/80 hover:bg-accent/60',
                    )}
                    onClick={() => onSelectSession(s.id)}
                    title={`${s.title} · ${timeAgo(s.updatedAt)} ago`}
                    aria-current={active ? 'true' : undefined}
                  >
                    <span
                      className={cn('size-1.5 shrink-0 rounded-full', active ? 'bg-emerald-500' : 'bg-muted-foreground/40')}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">{s.title}</span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{timeAgo(s.updatedAt)}</span>
                  </button>
                  {sessions.length > 1 && (
                    <button
                      className="absolute right-1 top-1/2 hidden -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground group-hover:block"
                      onClick={(e) => { e.stopPropagation(); onRemoveSession(s.id) }}
                      title={`Delete ${s.title}`}
                      aria-label={`Delete ${s.title}`}
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </li>
              )
            })}
            {filteredSessions.length === 0 && (
              <li className="px-2 py-2 text-xs text-muted-foreground">No agents match.</li>
            )}
          </ul>

          <button
            className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-muted-foreground hover:bg-accent/60 hover:text-foreground"
            onClick={actions.onOpenHistory}
            title="Snapshots and checkpoints"
          >
            <History className="size-3.5" /> History
          </button>

          <div className="px-1.5 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Project
          </div>
          <FileExplorer readOnly={state.isSharedView || state.readOnly} filter={fileFilter} />
        </div>
      </ScrollArea>

      {/* Profile */}
      <div className="flex shrink-0 items-center gap-2.5 border-t border-border/70 px-3 py-2.5">
        <span
          className="grid size-8 shrink-0 select-none place-content-center rounded-full bg-zinc-800 font-mono text-[11px] font-semibold text-white"
          aria-hidden
        >
          {initials(user?.email)}
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[13px] font-medium">{user?.email ?? 'Local mode'}</span>
          <span className="block font-mono text-[10px] text-muted-foreground" title="Runs used today">
            {todayCount}/{dailyCap} runs
          </span>
        </span>
        {user ? (
          <button
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={actions.onLogout}
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut className="size-4" />
          </button>
        ) : (
          <button
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={actions.onLogin}
            title="Account settings — sign in"
            aria-label="Account settings"
          >
            <Settings className="size-4" />
          </button>
        )}
      </div>
    </div>
  )
}
