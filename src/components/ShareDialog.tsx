import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Check, Copy, ExternalLink, Trash2 } from 'lucide-react'

interface ShareDialogProps {
  link: string
  onClose: () => void
  onStopSharing: () => void
}

export default function ShareDialog({ link, onClose, onStopSharing }: ShareDialogProps) {
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(true)

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share project</DialogTitle>
          <DialogDescription>
            Anyone with this link can <strong>view</strong> your project. They can't edit or save changes.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
          <Button onClick={copy} variant="outline" size="icon" title="Copy link">
            {copied ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
          </Button>
        </div>
        <DialogFooter className="sm:justify-start">
          <Button asChild variant="outline">
            <a href={link} target="_blank" rel="noreferrer">
              <ExternalLink className="mr-2 size-4" /> Open shared view
            </a>
          </Button>
          <Button
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={async () => { await onStopSharing(); setOpen(false); onClose() }}
          >
            <Trash2 className="mr-2 size-4" /> Stop sharing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}