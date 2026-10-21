# zut-term — the Zut IDE in your terminal

Runs the real Zut app inside a terminal window using
[`@zenbu-labs/pixel`](https://pixelgui.com),
a React renderer that paints actual pixels into the terminal over the kitty
graphics protocol. Every pane, modal, editor and drawer in the browser build
works the same way — it is the same app, not a reimplementation.

```
┌──────────────────────────────────────────────────────────┐
│ Zut  http://127.0.0.1:4173/      ready  ⌃Q quit · ⌃R · ⌃⇧D │  ← native pixel UI
├──────────────────────────────────────────────────────────┤
│                                                          │
│                     the Zut IDE                          │  ← WebView
│                                                          │
└──────────────────────────────────────────────────────────┘
```

## Requirements

A terminal that supports the **kitty graphics protocol**:

- kitty, ghostty, wezterm, foot, cmux, supacode, tty7 — full support.
- tmux — works through kitty graphics passthrough, with lower precision mouse
  and reduced performance. Enable it with `set -g allow-passthrough on` (tmux
  3.3+). Inside tmux it is the *client* terminal that must support the
  protocol: tmux passthrough alone is not enough.

On macOS, Terminal.app and iTerm2 do **not** support the kitty graphics
protocol — use kitty, ghostty or wezterm there.

The launcher checks both things before it hands the screen to pixel: that the
IDE is actually serving the URL, and that the terminal answers the kitty
graphics query. If either fails it says so instead of painting a broken
picture.

```
zut-term: nothing is serving the IDE at http://127.0.0.1:5173/.
  Start it on this machine with `npm run dev` (or `npm run local`),
  or point at another URL with --url.

zut-term: this terminal cannot draw the kitty graphics protocol, so the
  IDE cannot be shown here. Use one of: kitty, ghostty, wezterm, foot …
```

## Setup

The terminal client is its own package so the root install stays light (pixel
downloads a patched Electron runtime, ~280 MB).

```bash
npm run term:setup     # installs + builds terminal/
npm run term           # launches
npm run term:local     # launches the dev build and the local stack
```

`npm run term:local` starts the whole local stack (opencode, file bridge,
host, broker, dev server) and attaches the terminal to the same dev server
the browser uses — one IDE, one agent, one workspace. See the root README.

Or by hand:

```bash
npm --prefix terminal install
npm --prefix terminal run build
node terminal/bin/zut-term.mjs
```

## Usage

```
zut-term [url] [options]

  --url <url>   Load an already-running Zut app instead of serving one.
  --port <n>    Port for the local app server (default 4173).
  --dev         Serve with the Vite dev server (hot reload).
  --rebuild     Rebuild the app before serving it.
  -h, --help    Show help.
```

By default the launcher serves the production build with `vite preview`,
rebuilding it first if `dist/` is missing. `--dev` swaps in the Vite dev
server. If something is already serving the port it is reused rather than
started twice.

### Keys

| Key | Action |
|---|---|
| `Ctrl+Q` | Quit |
| `Ctrl+R` | Reload the app |
| `Ctrl+Shift+D` | Toggle the devtools panel |

`Ctrl+C` is deliberately left to the app so copy and paste keep working.

## Notes

- The app is served on `127.0.0.1`, which is what the waitlist gate lets
  through — the terminal client is never blocked by the launch gate.
- The run backend (`VITE_BROKER_URL`) is baked into the build, so `Run` needs
  the broker configured at build time. Without it the IDE still previews web
  projects in-browser.
- `Ctrl+Shift+D` opens the pixel devtools (element inspector, profiler, log
  viewer) for the native terminal UI.

## Layout

```
terminal/
  bin/zut-term.mjs    # entry wrapper → dist/launcher.js
  src/options.ts      # argument parsing (pure, unit tested)
  src/server.ts       # serves the app, waits for it, owns the child process
  src/launcher.ts     # plain-node launcher: serve → exec pixel
  src/main.tsx        # pixel entry: root, global keys
  src/ZutApp.tsx      # native status bar + the IDE as a WebView
  src/commands.ts     # key → command registry
  test/options.test.ts
```
