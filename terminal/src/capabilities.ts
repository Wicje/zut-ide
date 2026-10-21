// Terminal capability checks that run before pixel takes over the screen.
//
// Two things go wrong silently otherwise:
//   1. the IDE is not running at the URL (wrong machine, stack not started)
//      → the terminal shows a broken image with no explanation;
//   2. the terminal cannot draw the kitty graphics protocol
//      → pixel paints garbage.
//
// Both are cheap to check up front, so the launcher can say what is wrong.

export type GraphicsSupport = 'supported' | 'unsupported' | 'unknown';

const PROBE_ID = 4207;
const PROBE_TIMEOUT_MS = 900;

/** The terminals that can show the IDE. */
export const GRAPHICS_TERMINALS = 'kitty, ghostty, wezterm, foot — or tmux whose client terminal supports the kitty graphics protocol';

function isTty(): boolean {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY && process.stdin.setRawMode);
}

/**
 * Asks the terminal whether it speaks the kitty graphics protocol.
 *
 * `supported`   the terminal answered OK.
 * `unsupported` the terminal answered "not OK" — it will never draw.
 * `unknown`     no answer (too slow, or the query never reached it).
 */
export async function probeGraphics(timeoutMs = PROBE_TIMEOUT_MS): Promise<GraphicsSupport> {
  if (!isTty()) return 'unknown';

  const inTmux = Boolean(process.env.TMUX);
  const query = `\x1b_Gi=${PROBE_ID},a=q,t=d,f=24,s=1,v=1;AAAA\x1b\\`;
  const payload = inTmux ? `\x1bPtmux;${query.replaceAll('\x1b', '\x1b\x1b')}\x1b\\` : query;

  const wasRaw = process.stdin.isRaw;
  return new Promise<GraphicsSupport>((resolve) => {
    let buffer = '';
    let done = false;
    const finish = (result: GraphicsSupport) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      process.stdin.off('data', onData);
      try {
        if (!wasRaw) process.stdin.setRawMode?.(false);
      } catch {
        /* ignore */
      }
      if (result !== 'supported') {
        // A terminal without graphics support may have printed the payload.
        try {
          process.stdout.write('\x1b8\x1b[J');
        } catch {
          /* ignore */
        }
      }
      resolve(result);
    };
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString('binary');
      const at = buffer.indexOf(`Gi=${PROBE_ID};`);
      if (at < 0) {
        if (buffer.length > 2048) finish('unknown');
        return;
      }
      finish(buffer.slice(at + `Gi=${PROBE_ID};`.length).startsWith('OK') ? 'supported' : 'unsupported');
    };

    const timer = setTimeout(() => finish('unknown'), timeoutMs);
    try {
      process.stdin.setRawMode?.(true);
    } catch {
      finish('unknown');
      return;
    }
    process.stdin.resume();
    process.stdin.on('data', onData);
    try {
      process.stdout.write('\x1b7' + payload + '\x1b[c');
    } catch {
      finish('unknown');
    }
  });
}

/** True when something is actually serving the app at this URL. */
export async function isReachable(url: string, timeoutMs = 2000): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.status < 500;
  } catch {
    return false;
  }
}

/** The message shown when the IDE is not serving the URL. */
export function unreachableMessage(url: string): string {
  return [
    `zut-term: nothing is serving the IDE at ${url}.`,
    '  Start it on this machine with `npm run dev` (or `npm run local`),',
    '  or point at another URL with --url.',
  ].join('\n');
}

/** The message shown when the terminal cannot draw the IDE. */
export function unsupportedMessage(): string {
  return [
    'zut-term: this terminal cannot draw the kitty graphics protocol, so the',
    `  IDE cannot be shown here. Use one of: ${GRAPHICS_TERMINALS}.`,
    '  Inside tmux the *client* terminal must support it (tmux passthrough',
    '  alone is not enough).',
  ].join('\n');
}
