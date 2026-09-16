import { useEffect, useState } from 'react'
import { supabaseOrNull } from '../lib/supabase'
import type { StoredRow } from '../lib/backend'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { FolderOpen, Globe, Lock, Trash2, FolderDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ProjectListProps {
  projects: StoredRow[]
  onOpen: (id: string) => void
  onOpenLocal: () => void
  onDelete: (id: string) => void
  onClose: () => void
  hasLocalDraft: boolean
}

export default function ProjectList({ projects, onOpen, onOpenLocal, onDelete, onClose, hasLocalDraft }: ProjectListProps) {
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [user, setUser] = useState<{ email?: string | null } | null>(null)
  const [open, setOpen] = useState(true)

  useEffect(() => {
    supabaseOrNull()?.auth.getUser().then(({ data }) => setUser(data.user)).catch(() => {})
  }, [])

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) onClose() }}>
      <DialogContent className="flex h-[70vh] max-h-[600px] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Projects</DialogTitle>
          {user && (
            <p className="text-xs text-muted-foreground">Signed in as {user.email}</p>
          )}
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1 pr-3">
          <div className="grid gap-1.5">
            {hasLocalDraft && (
              <button
                onClick={onOpenLocal}
                className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2.5 text-left transition-colors hover:bg-muted/60"
              >
                <FolderDown className="size-4 shrink-0 text-amber-400" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  current draft (not saved to cloud)
                </span>
                <Badge variant="outline" className="text-[10px]">local</Badge>
              </button>
            )}
            {projects.map((p) => (
              <div
                key={p.id}
                className="group flex items-center gap-3 rounded-lg border border-border/60 bg-card/40 px-3 py-2.5 transition-colors hover:border-border hover:bg-accent/40"
              >
                <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => onOpen(p.id)}>
                  <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                  <span className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                    {p.share_token ? (
                      <><Globe className="size-3 text-emerald-400" /> shared</>
                    ) : (
                      <><Lock className="size-3" /> private</>
                    )}
                  </span>
                </button>
                {confirmId === p.id ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 px-2 text-[11px]"
                      onClick={(e) => { e.stopPropagation(); onDelete(p.id); setConfirmId(null) }}
                    >
                      Confirm
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className={cn('h-7 px-2 text-[11px]')}
                      onClick={(e) => { e.stopPropagation(); setConfirmId(null) }}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0 opacity-0 text-muted-foreground transition-opacity group-hover:opacity-100"
                    title="Delete"
                    onClick={(e) => { e.stopPropagation(); setConfirmId(p.id) }}
                  >
                    <Trash2 className="size-3.5 hover:text-destructive" />
                  </Button>
                )}
              </div>
            ))}
            {projects.length === 0 && !hasLocalDraft && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No saved projects yet. Press <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">Save</kbd> to create one.
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}