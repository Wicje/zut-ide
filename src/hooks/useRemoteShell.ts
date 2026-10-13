import { useEffect, useState } from 'react';
import { brokerEnabled, terminalToken } from '../adapters/zut';

// Honest remote-shell line for the terminal tab, extracted verbatim from
// App.tsx (no behavior change). Probed when the drawer opens, never faked:
// demo brokers mint a token but expose no shell endpoint.
export function useRemoteShell(isTerminalOpen: boolean): string | null {
  const [remoteLine, setRemoteLine] = useState<string | null>(null);
  useEffect(() => {
    if (!isTerminalOpen) return;
    let cancelled = false;
    void (async () => {
      const { termRemoteStatus } = await import('../lib/terminal');
      if (cancelled) return;
      if (!brokerEnabled()) {
        setRemoteLine(termRemoteStatus({ mode: 'off' }));
        return;
      }
      try {
        const t = await terminalToken();
        if (cancelled) return;
        setRemoteLine(
          t.gatewayUrl
            ? termRemoteStatus({ mode: 'live', expiresInSec: t.expiresInSec })
            : termRemoteStatus({ mode: 'demo', detail: 'token minted, no shell endpoint in demo' }),
        );
      } catch (e) {
        if (!cancelled) setRemoteLine(`Remote shell: unreachable (${(e as Error).message.slice(0, 80)}).`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isTerminalOpen]);
  return remoteLine;
}
