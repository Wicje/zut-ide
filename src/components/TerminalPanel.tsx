import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { TerminalSquare, Loader2 } from 'lucide-react'
import { brokerEnabled, brokerTerminalToken } from '../lib/broker'

interface TerminalPanelProps {
  workspaceId: string | null
  userToken: string | null
  onLog: (level: 'info' | 'error', message: string) => void
}

// Interactive terminal (broker -> Cells gateway).
// Browser opens one direct WebSocket to the gateway with a 60s token.
// Terminal bytes only — never project auth, never service keys.
// xterm attaches here once `xterm` dep is added; until then this panel
// owns the token lifecycle + reconnect UI so the contract is fixed.
export default function TerminalPanel({ workspaceId, userToken, onLog }: TerminalPanelProps) {
  const [busy, setBusy] = useState(false)
  const [token, setToken] = useState<string | null>(null)

  async function connect() {
    if (!workspaceId || !userToken) {
      onLog('error', 'Sign in and save to the cloud before opening a terminal.')
      return
    }
    if (!brokerEnabled()) {
      onLog('error', 'Terminal needs the remote runner (set VITE_RUNTIME_URL to your broker).')
      return
    }
    setBusy(true)
    try {
      const t = await brokerTerminalToken(workspaceId, userToken)
      setToken(t.token)
      onLog('info', 'Terminal token issued (valid 60s). Reconnect asks the broker for a new one.')
      // Next step: open gateway WebSocket with t.token and attach xterm.
      // URL comes from broker preview/open response; keystrokes go direct.
    } catch (e) {
      onLog('error', `Terminal failed: ${(e as Error).message.replace(/^(QUOTA_EXHAUSTED|FORBIDDEN|RATE_LIMITED):/, '')}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-2 rounded-lg border p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <TerminalSquare className="size-4 text-muted-foreground" /> Terminal
      </div>
      <p className="text-xs text-muted-foreground">
        Low-latency shell on your private computer. Editing stays free — only terminal time uses run time.
      </p>
      <Button size="sm" className="w-fit gap-1.5" onClick={connect} disabled={busy}>
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <TerminalSquare className="size-3.5" />}
        {token ? 'Reconnect terminal' : 'Open terminal'}
      </Button>
      {token && <p className="font-mono text-[10px] text-muted-foreground">token held in memory · expires in 60s · reconnect refreshes</p>}
    </div>
  )
}
