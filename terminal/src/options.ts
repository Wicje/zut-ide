// Command-line surface for `zut-term`. Pure: no filesystem, no network, no
// child processes — so it can be unit tested without a terminal.

export type ServeMode = 'preview' | 'dev';

export interface TermOptions {
  /** Explicit app URL. When set, no local server is started. */
  url: string | null;
  /** Port the local app server binds to. */
  port: number;
  /** How the Zut app is served when no explicit URL is given. */
  mode: ServeMode;
  /** Rebuild the app before serving (dist/ is missing or stale). */
  rebuild: boolean;
  help: boolean;
}

export const DEFAULT_PORT = 4173;

export class UsageError extends Error {}

export const USAGE = `zut-term — the Zut IDE in your terminal

Usage:
  zut-term [url] [options]

Options:
  --url <url>     Load an already-running Zut app instead of serving one.
  --port <n>      Port for the local app server (default ${DEFAULT_PORT}).
  --dev           Serve the app with the Vite dev server (hot reload).
  --rebuild       Rebuild the app before serving it.
  -h, --help      Show this help.

Keys inside the terminal:
  Ctrl+Q           Quit
  Ctrl+R           Reload the app
  Ctrl+Shift+D     Toggle the devtools panel

The terminal needs the kitty graphics protocol: kitty, ghostty, wezterm,
foot, or tmux with graphics passthrough.`;

export function usage(): string {
  return USAGE;
}

function parsePort(raw: string | undefined): number {
  if (raw === undefined) throw new UsageError('--port needs a number.');
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new UsageError(`--port must be a port number, got "${raw}".`);
  }
  return n;
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new UsageError('--url needs a value.');
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new UsageError(`--url must start with http:// or https://, got "${trimmed}".`);
  }
  return trimmed;
}

export function parseArgs(argv: readonly string[]): TermOptions {
  const opts: TermOptions = {
    url: null,
    port: DEFAULT_PORT,
    mode: 'preview',
    rebuild: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    switch (arg) {
      case '-h':
      case '--help':
        opts.help = true;
        break;
      case '--dev':
        opts.mode = 'dev';
        break;
      case '--rebuild':
        opts.rebuild = true;
        break;
      case '--url':
        opts.url = normalizeUrl(argv[++i] ?? '');
        break;
      case '--port':
        opts.port = parsePort(argv[++i]);
        break;
      default:
        if (arg.startsWith('--url=')) {
          opts.url = normalizeUrl(arg.slice('--url='.length));
        } else if (arg.startsWith('--port=')) {
          opts.port = parsePort(arg.slice('--port='.length));
        } else if (arg.startsWith('-')) {
          throw new UsageError(`Unknown option "${arg}".`);
        } else if (!opts.url) {
          // A bare argument is the app URL.
          opts.url = normalizeUrl(arg);
        }
        break;
    }
  }

  return opts;
}
