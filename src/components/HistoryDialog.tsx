import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { BookmarkPlus, Loader2, RotateCcw } from 'lucide-react'
import {
  listWorkspaceSnapshots,
  restoreWorkspaceSnapshot,
  saveWorkspaceCheckpoint,
  type SnapshotRecord,
} from '../lib/persistence'
import type { FileMap } from '../types'

interface HistoryDialogProps {
  projectId: string | null
  projectName: string
  files: FileMap
  onRestore: (name: string, files: FileMap) => void
  onClose: () => void
}

function formatWhen(ts: number): string {
  const diff = Date.now() - ts
  const min = Math.round(diff / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const hours = Math.round(min / 60)
  if (hours < 24) return `${hours} h ago`
  return new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function HistoryDialog({ projectId, projectName, files, onRestore, onClose }: HistoryDialogProps) {
  const [open, setOpen] = useState(true)
  const [snapshots, setSnapshots] = useState<SnapshotRecord[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [checkpointing, setCheckpointing] = useState(false)

  async function refresh() {
    setSnapshots(await listWorkspaceSnapshots(projectId, projectName))
  }

  useEffect(() => {
    void refresh()
  }, [projectId, projectName])

  async function checkpoint() {
    setCheckpointing(true)
    try {
      await saveWorkspaceCheckpoint(projectId, projectName, files)
      await refresh()
    } finally {
      setCheckpointing(false)
    }
  }

  async function restore(id: string) {
    setBusyId(id)
    try {
      const snapshot = await restoreWorkspaceSnapshot(id)
      if (snapshot) {
        onRestore(snapshot.name, snapshot.files)
        setOpen(false)
        onClose()
      }
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Version history</DialogTitle>
          <DialogDescription>
            Snapshots of <span className="font-medium text-foreground">{projectName}</span> are captured every 30s while
            you edit. The last 20 are kept on this device.
          </DialogDescription>
        </DialogHeader>

        <Button variant="outline" size="sm" className="w-fit" onClick={checkpoint} disabled={checkpointing}>
          {checkpointing ? <Loader2 className="mr-2 size-4 animate-spin" /> : <BookmarkPlus className="mr-2 size-4" />}
          Save checkpoint
        </Button>

        <div className="max-h-80 overflow-auto rounded-lg border">
          {snapshots === null ? (
            <div className="grid place-items-center p-6 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
            </div>
          ) : snapshots.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              No snapshots yet. Start editing or save a checkpoint.
            </p>
          ) : (
            <ul className="divide-y">
              {snapshots.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{formatWhen(s.createdAt)}</span>
                      {s.kind === 'checkpoint' && (
                        <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                          checkpoint
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {Object.keys(s.files).length} files · {s.name}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="shrink-0"
                    onClick={() => restore(s.id)}
                    disabled={busyId !== null}
                  >
                    {busyId === s.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <RotateCcw className="mr-1.5 size-3.5" />
                    )}
                    Restore
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  )
}