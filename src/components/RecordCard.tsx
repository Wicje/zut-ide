import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Circle, MonitorPlay, Square, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// Screen recording attached to the composer: captures via getDisplayMedia
// (user-approved share), records with MediaRecorder, plays back locally.
// Nothing uploads anywhere — the clip lives in this tab's memory.
export default function RecordCard({ onLog }: { onLog: (level: 'info' | 'error', message: string) => void }) {
  const [phase, setPhase] = useState<'idle' | 'recording' | 'ready'>('idle')
  const [url, setUrl] = useState<string | null>(null)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)

  const supported = typeof window !== 'undefined' && 'getDisplayMedia' in (navigator.mediaDevices ?? {})

  useEffect(() => () => {
    if (timerRef.current) window.clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    if (url) URL.revokeObjectURL(url)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function start() {
    if (!supported) {
      setError('Screen capture is not supported in this browser.')
      return
    }
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true })
      const rec = new MediaRecorder(stream)
      chunksRef.current = []
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data)
      }
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'video/webm' })
        setUrl(URL.createObjectURL(blob))
        setPhase('ready')
        onLog('info', 'Screen recording ready — attached below, stays in this browser.')
      }
      stream.getVideoTracks()[0]?.addEventListener('ended', () => stop())
      streamRef.current = stream
      recorderRef.current = rec
      rec.start()
      setSeconds(0)
      setPhase('recording')
      timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000)
    } catch {
      setError('Capture dismissed — nothing was recorded.')
    }
  }

  function stop() {
    if (timerRef.current) window.clearInterval(timerRef.current)
    timerRef.current = null
    try {
      recorderRef.current?.stop()
    } catch {
      /* already stopped */
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
  }

  function discard() {
    if (url) URL.revokeObjectURL(url)
    setUrl(null)
    setSeconds(0)
    setPhase('idle')
  }

  return (
    <div className="grid gap-2 rounded-xl border border-border/70 bg-card p-3">
      <div className="flex items-center gap-2 text-[13px] font-medium">
        <MonitorPlay className="size-4 text-muted-foreground" />
        Screen recording
        {phase === 'recording' && (
          <span className="ml-auto flex items-center gap-1.5 font-mono text-[11px] text-red-600">
            <span className="size-1.5 animate-pulse rounded-full bg-red-600" aria-hidden />
            REC {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
          </span>
        )}
      </div>

      {phase === 'ready' && url ? (
        <>
          <video src={url} controls playsInline className="aspect-video w-full rounded-lg bg-black" />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={discard}>
              <Trash2 className="size-3.5" /> Discard
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { discard(); void start() }}>
              <Circle className="size-3.5" /> Re-record
            </Button>
          </div>
        </>
      ) : phase === 'recording' ? (
        <Button size="sm" variant="destructive" className="w-fit gap-1.5" onClick={stop}>
          <Square className="size-3.5 fill-current" /> Stop
        </Button>
      ) : (
        <Button size="sm" variant="outline" className="w-fit gap-1.5" onClick={() => void start()}>
          <Circle className="size-3.5 text-red-600" /> Record screen
        </Button>
      )}
      {error && <p className={cn('text-xs', 'text-red-600')}>{error}</p>}
      {phase === 'idle' && !error && (
        <p className="text-xs text-muted-foreground">Capture a repro to show the agent — stays in this browser.</p>
      )}
    </div>
  )
}
