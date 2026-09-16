import { useState } from 'react'
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
import { Glasses } from 'lucide-react'

interface ImportDialogProps {
  onClose: () => void
  onImport: (url: string) => void
}

export default function ImportDialog({ onClose, onImport }: ImportDialogProps) {
  const [url, setUrl] = useState('')
  const [open, setOpen] = useState(true)

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Import project</DialogTitle>
          <DialogDescription>
            Paste a URL to import. Supports HTML pages, CodePen, and GitHub raw files.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (url.trim()) onImport(url.trim())
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="import-url">URL</Label>
            <Input
              id="import-url"
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://codepen.io/user/pen/abc123"
              autoFocus
            />
          </div>
          <Button type="submit" disabled={!url.trim()}>
            <Glasses className="mr-2 size-4" /> Import
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}