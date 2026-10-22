# Zut — desktop-class coding in the browser. Nothing to install.

> Read `VISION.md` for the full product story: who this is for, the wall
> Cursor/Lovable/Bolt run into, and how the classroom plan validates it.

A browser IDE (resizable 3-pane shell: sidebar, agent composer,
diff / editor / preview / checks). The agent writes the files, the IDE shows
you the diff, the preview runs live. The heavy part — installs, builds, runs
— happens on Zut Compute (our servers) or on your own machine if you
self-host, so a phone, a Chromebook or a 4GB laptop is enough.

You create an account (free) and pick where the agent runs. Editing is free
— only runs use run time.

AI is optional: plain code + Run works with no key and no AI. When you want
it, bring your own key or use the hosted agent.

## Why Zut

Cursor's agent writes your files — then `npm install` and the build run on
*your* laptop, which is where a 4GB machine or a phone hits the wall.
Lovable and Bolt build in their cloud but hand you a deploy, not an IDE.
Zut keeps the agentic workflow and moves the heavy part to our machines:

- **The build runs on Zut Compute, not on you.** Same agent-writes-files
  workflow, except installs, builds and program runs happen on our servers
  (or on your own box if you prefer) — so the machine you have is enough.
- **A real IDE, not just prompts.** Hand-write code when you want — Monaco,
  tabs, shortcuts, format, run. Let the agent type when you don't. Same
  window, your choice every turn.
- **Self-host is first-class.** The agent can be
  [opencode](https://opencode.ai) on your own machine — your models, your
  keys, your quota; a real PTY; real git; no telemetry.
- **Bring your own agent, not a vendor's models.** The model picker lists
  whatever your agent serves — opencode zen, OpenRouter, Cerebras, anything
  else you connect. Zut is a client of the agent, not a locked-in product.
- **The agent asks before it acts.** Plan mode writes a checklist you tick
  off; a question from the agent becomes a card you answer. Every turn is a
  per-file diff you accept or revert, with checkpoints.

- **Editor**: Monaco (VS Code's editor) with IntelliSense and red-squiggle type errors for JS/TS.
- **Multiple files**: `index.html`, `style.css`, `script.js`, `script.ts`, `main.py`, `main.go`, JSON, text — anything.
- **Desktop shell**: resizable sidebar / composer / right-pane window on a wallpaper
  stage, with light + dark themes. The right pane switches Diff / Editor / Preview /
  Checks; every pane and modal follows one token system (see `DESIGN.md`).
- **Web projects**: JS/TS files can `import`/`export` across files. `.ts`/`.tsx` is compiled in
  the browser with **esbuild-wasm**.
- **Any language**: no language menu — describe what you want and the agent writes
  the code (`main.py`, `main.go`, anything). Programs execute on the remote runtime (`POST /run`) so weak devices never compile locally. Stdin is built into the Output panel.
- **Framework templates**: *New ▾* includes starter projects for **React** and **Vue** (which run
  live in the preview — React/vue packages are pulled from the esm.sh CDN and `.vue` single-file
  components are compiled in-browser with `@vue/compiler-sfc`). Server frameworks (Next.js / Express / NestJS)
  are compile-checked only, not executed — use the Deploy dialog hints or a Mudbase function for a real backend.
- **Preview + console**: web code runs in a sandboxed `<iframe>`; `console.log`, warnings, DOM errors
  and unhandled promise rejections are streamed into a console panel. Python/Go output (stdout/stderr + exit code) renders in the same Output panel as terminal text.
- **Persistence**: works out of the box with zero backend (localStorage draft). Optionally connect
  **Supabase** for accounts, cloud save, a project library, and read-only share links.
- **Save to disk**: open a folder (File System Access) or a `zut host`
  workspace; device drafts stay in this browser until you do.

## Feature highlights

- **Auto formatter** — the *Format* button runs Prettier (in-browser) on the active HTML/CSS/JS/TS/JSON file.
- **File upload & drop zone** — drag files onto the file explorer or use ↑ to upload images (as data URLs),
  fonts, JSON, and code files from your device.
- **Multi-viewport preview** — on desktop, switch the result between phone (375px) / tablet (768px) /
  full width to test responsive layouts without leaving the IDE.
- **Import from URL** — *New ▾ → Import from URL* accepts a GitHub repo (or
  `/tree/<ref>/<path>`), an HTML page, a CodePen, or a raw GitHub file, and
  scaffolds a project from it.
- **One-click deploy** — the *Deploy* button publishes the project to a live
  Vercel URL through your own Vercel token (saved once in account settings,
  validated and stored server-side). Signed-in users only; never anonymous.
- **GitHub push** — push any project with one commit (repo auto-created when
  missing), your branch and message, and a real pull request for feature
  branches. Classic token with `repo` scope, kept in your browser.
- **Server compile-check** — for Express / NestJS / Next.js projects, the *Deploy* dialog can
  compile-check your server entry (`src/main.ts`, `server.js`, …) in the browser without a Node
  runtime, surfacing syntax and import-graph errors before you push.
- **AI assistant** — prompt in plain English; the agent streams reviewable steps
  with checkpoints. Bring your own key (Gemini, OpenRouter, Claude, ChatGPT),
  run free models via self-hosted opencode, and attach images the models can
  actually see. Keys stay in your browser.
- **AI completion** — type and the editor offers the rest of the line as ghost
  text; Tab takes it. Straight to the provider you already have a key for, so
  nothing is proxied through us. Toggle it with the *AI* button in the editor.
- **Plan mode** — ask for a plan and the agent writes one: a markdown checklist
  you can tick off, and it asks you a question when it needs a decision.
- **Run checks** — the Checks pane executes the project entry and lists each run
  as a pass/fail row with output; failing rows offer agent auto-fix.
- **Resilient workspace** — every New / Import / Restore / revert / rollback
  snapshots first, so History can always undo. A crash boundary keeps a Reload
  screen instead of a blank app.

## Quick start

```bash
npm install
npm run dev        # → http://127.0.0.1:5173
```

The app runs fine with no configuration — try it before touching Supabase.
"New project" → pick a template, edit, watch the preview, open the console.

## Run it on your own laptop (no VPS needed)

`npm run dev` starts the whole local stack by itself — you do not have to
launch anything else. It brings up:

| service | port | what it is |
|---|---|---|
| opencode | 4096 | the coding agent — your models, your machine |
| file bridge | 4331 | moves the IDE's project files in and out of the disk workspace |
| zut host | 8790 | real workspace, git, real terminal |
| zut broker | 8787 | program runs (python/go) and previews |
| vite | 5173 | the IDE itself |

Everything binds loopback only. Two workspaces on this machine:

- `~/.zut-projects/agent` — a scratch copy of the project the IDE has open.
  The bridge mirrors it exactly (no leftovers from another project), and the
  agent works here.
- `~/.zut-projects/host` — the real workspace behind "Open host", with git
  and a real terminal.

```bash
npm run dev            # browser: http://127.0.0.1:5173
npm run term:local     # the same IDE in your terminal, same agent
npm run local:status   # what is up
npm run local:down     # stop it
npm run local:logs     # tail every service log
```

The IDE polls for the agent, so "opencode (self-host)" appears in the model
picker as soon as the server is ready — no reload needed. When the VPS
arrives, point the `VITE_*` URLs in `.env` at it and the same app talks to
the server instead.

### Start it at login (systemd)

```bash
npm run local:install    # user service, no root
```

That installs `zut-local-stack.service` into `~/.config/systemd/user/`, so
the IDE and the local agent are waiting at every login — open
http://127.0.0.1:5173/ or run `npm run term -- --url http://127.0.0.1:5173/`
without starting anything first. The service supervises the stack: a service
that dies is restarted in 2s.

```bash
systemctl --user status zut-local-stack    # is it up
journalctl --user -u zut-local-stack -f    # follow the logs
npm run local:uninstall                    # remove it
```

It is a *user* service, so it stops when you log out. To have it running
from boot without a login: `loginctl enable-linger $USER`.

## The IDE in your terminal

`zut-term` runs the same IDE inside a terminal window, painting real pixels
over the kitty graphics protocol via
[`@zenbu-labs/pixel`](https://pixelgui.com).
It is the same app — every pane, modal and editor behaves identically.

```bash
npm run term:setup     # installs + builds the terminal client (one-off)
npm run term           # launches (production build)
npm run term:local     # launches the dev build, shared with the browser
```

Needs kitty, ghostty, wezterm, foot, or tmux with graphics passthrough. See
[`terminal/README.md`](terminal/README.md) for keys and options.

## Real workspace: local folder or host

Two ways to work on real files, both read/write from day one:

- **Open folder** (sidebar, `Ctrl/⌘ + O`): uses the File System Access API in
  Chrome, Edge, or ChromeOS. Edits autosave to disk, external edits reload on
  interval, and deleting/renaming a file is confirmed in the IDE first.
  `.env*` and generated folders are skipped. Lockfiles are synced.
- **Host workspace** (sidebar → Connect host): run the host on the machine that
  owns the files, then open the same workspace from any browser. Edits autosave
  to the host, external edits reload, and the Terminal/Debug drawers get a real
  pty + Node debugger. Lockfiles are synced; `.env*` and generated folders are
  skipped.

```bash
npm run host        # → http://localhost:8790
```

The host serves the workspace API, allow-listed git routes, a real pty, and a
Node CDP debugger over WebSocket. For a LAN/VPS bind, set a token or it refuses
to start:

```bash
ZUT_HOST_TOKEN=$(openssl rand -hex 32) \
ZUT_WORKSPACE=$HOME/projects/my-app \
ZUT_HOST_MODE=hosted \
CORS_ORIGIN=https://your-ide.example \
HOST=0.0.0.0 npm run host
```

Use the IDE's "Connect host" dialog for the URL + token (stored in this
browser). `CORS_ORIGIN` must include the IDE's origin whenever the host is
reached from a non-loopback page. Browsers also block an `https://` IDE from
calling an `http://` host, so put the host behind TLS for remote use.

Prefer the dialog for anything beyond loopback: `VITE_*` values are baked into
the public browser bundle, so **never set `VITE_ZUT_HOST_TOKEN` for an exposed
host** — that publishes the token to every visitor. `VITE_ZUT_HOST_URL` alone is
fine when the token is entered per browser. `ZUT_TERMINAL_JAIL=1` (hosted
default) pins the shell to the workspace with a minimal env; self-hosted
full-shell mode is the default on loopback. The host token is a shared secret,
not a user identity — run one host per person/workspace.

## Production build

```bash
npm run build && npm run preview
```

## Landing page + accounts (live)

The marketing site in `landing/` is a dependency-free static page (dark Cursor-style,
light/dark toggle, staggered entrances, cursor spotlight, scroll progress) that sells
the IDE with screenshots of the actual product. Hero + final CTA carry an account form:

- Creating an account POSTs to Supabase Auth (`/auth/v1/signup`) with the public
  publishable key — no library, no CLI.
- When the project signs people in immediately, the session is stored under the
  key supabase-js reads (`sb-<project-ref>-auth-token`) and the new user lands in
  the IDE already signed in.
- When email confirmation is on, the page says "check your email" and the IDE's
  account page handles the sign-in.
- The old waitlist capture (`join the waitlist`, `waitlist` table + welcome-mail
  trigger) is retired; `supabase/waitlist.sql` can stay in the project but the
  forms no longer use it.

Setup: none beyond Supabase Auth being enabled for the project (email provider,
password sign-up). Preview locally: `npx serve landing`. Deploy:
`npx vercel deploy --cwd landing --prod` (static, no build step).
Live: https://landing-two-beta-xy9r9089if.vercel.app

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| `Ctrl/⌘ + Enter` | Run (preview for web, execute for Python/Go) |
| `Ctrl/⌘ + S` | Save (device, cloud, local folder, or host) |
| `Ctrl/⌘ + O` | Open a local folder (Chromium browsers) |
| `Ctrl/⌘ + K` | Toggle AI assistant (optional) |
| `F9` | Toggle a breakpoint on the current line (with a connected host) |

## Optional: run broker (runs + terminal + preview off-device)

Web projects bundle in the browser (or on `zut-cloud` when configured).
Python/Go **always** need the broker — they never execute on-device:

```bash
npm run broker             # → http://localhost:8787  (PORT to change)
```

Then point the IDE at it:

```bash
# .env.local
VITE_BROKER_URL=http://localhost:8787
```

The browser calls the broker's `/api/broker/*` routes with the signed-in user's
token; the broker holds service keys and enforces quotas. The legacy
`VITE_RUNTIME_URL` name is still accepted as an alias. If the broker is
unreachable, programs show a "needs runtime" hint instead of failing silently.
Tune with `ZUT_RUN_TIMEOUT_MS` (default 8000) and `ZUT_RUN_MAX_OUTPUT` (default 256KB).

The standalone `npm run runtime` service (`/build` + `/run`) is still available
for server-to-server use. When you expose it, set `ZUT_RUNTIME_TOKEN`; that token
is server-to-server only and is never shipped to the browser.

Short-term host: Render.com works for a few days — deploy `cloud/Dockerfile` as a
Web Service (Starter 2GB, health check `/health`), set `CORS_ORIGIN` to your
frontend, then use its URL as `VITE_CLOUD_URL` (builds + cloud agent). Python/Go
runs still need the separate broker (`npm run broker`, `VITE_BROKER_URL`). See
[cloud/DEPLOY.md](cloud/DEPLOY.md) for VPS vs Render notes.

## Optional: Supabase (accounts, cloud save, sharing)

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL editor** and run [supabase/schema.sql](supabase/schema.sql).
3. Copy `.env.example` to `.env` and fill in the URL + anon key:

   ```bash
   cp .env.example .env
   # VITE_SUPABASE_URL=https://YOUR-REF.supabase.co
   # VITE_SUPABASE_ANON_KEY=eyJ...
   ```

4. Optionally disable sign-ups in **Authentication → Providers → Email → "Allow new users to sign up"**
   if you want to hand-pick accounts.

How saving works:

- Logged out → edits autosave to this browser (localStorage).
- Logged in → **Save** creates a cloud project; after that edits autosave to the cloud (1.5 s debounce).
- **Share** on a cloud project generates a read-only link `…#/p/<token>`. Viewers open a sandboxed,
  read-only copy — they can't edit or see your account.

## Optional: Vercel deploy (Supabase Edge Function)

GitHub push and the AI assistant need no backend: the GitHub PAT and provider
key are entered in the IDE and stored in this browser only. Vercel deploy is the
one feature backed by a Supabase Edge Function — the function verifies the
signed-in user's JWT and stores the Vercel token in `zut_connections`.

1. Configure Supabase (previous section) and apply `supabase/schema_zut.sql`,
   which creates `zut_connections`.
2. Install and link the CLI:
   `npm i -g supabase`, then `supabase login` and
   `supabase link --project-ref YOUR_REF`.
3. Deploy just the deploy function:

   ```bash
   supabase functions deploy vercel-deploy --project-ref YOUR_REF
   ```

4. No extra secrets are needed: Supabase provides `SUPABASE_URL`,
   `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to the function. Paste a
   Vercel token in **Deploy → Vercel**; it is validated, stored server-side, and
   reused for later deploys.
5. The app finds the function from `VITE_SUPABASE_URL`. Reload, sign in, and
   open **Deploy → Vercel**.

The other functions in `supabase/functions` (`oauth-*`, `github-push`,
`connections`, `claude`) are legacy: the current client does not call them and
they can be left undeployed.

## How running code works

Project kind is detected from files (`src/adapters/filemap.ts`):
- `index.html` present → **web**. Steps 1-4 below.
- else `main.py` / `app.py` → **Python**; `main.go` / `go.mod` → **Go**. Step 5.

1. `index.html` is the web entry point.
2. `<link rel="stylesheet" href="...">` and `<script src="...">` tags pointing at project files are
   collected, then all JS/TS/CSS is bundled with esbuild. This runs in the browser by default, or on
   the [remote runtime](#optional-remote-runtime-build--run-on-a-server-not-the-phone) when configured.
   TS type-checking is done live by the editor; esbuild strips types for execution.
3. The bundled JS/CSS is inlined into a self-contained HTML string rendered in a sandboxed `<iframe>`
   (`allow-scripts`, no `same-origin` → the preview cannot touch the app).
4. A tiny harness inside the iframe reroutes `console.*`, `window.onerror` and
   `unhandledrejection` back to the IDE via `postMessage`.

Build errors (missing files, syntax errors, bad imports) are shown as red entries in the console.

5. Programs (Python/Go) POST `{ files, entry, stdin }` to `/run` and render `{ stdout, stderr, exitCode }`
   in the Output panel. Execution never happens on-device. Without a runtime the UI shows a
   "needs runtime" hint. Limits: 8s timeout, 256KB output cap, stdin capped at 64KB.

## AI: bring your own key, or self-host the agent

The **✨ AI** panel has two ways to run:

**1. Bring your own key (no sign-in, no zut server).** Pick a provider, paste a key, and chat. Keys
are stored only in this browser (`localStorage`, key `zut:ai:key:<provider>`) and requests go straight
from the browser to the provider:

| Provider | Notes |
| --- | --- |
| **OpenRouter** (default) | One key for Claude, GPT, Gemini, Llama and more. Get one at [openrouter.ai/keys](https://openrouter.ai/keys). Free models are listed too. |
| **Claude** | Direct Anthropic API key from [console.anthropic.com](https://console.anthropic.com). |
| **ChatGPT** | OpenAI API key. |
| **Gemini** | Google AI Studio key. |

Everything else in the IDE works without any key — only the AI panel needs one. Without a key, the
provider's tab shows an amber dot and a key prompt.

**2. Self-host the agent (the AI edits your files).** This runs the [opencode](https://opencode.ai)
agent on a server so it can read/write the project with real tools, while the phone or Chromebook only
renders the browser UI. Start the pieces you need on the same machine:

```bash
npm run dev:server   # zut-cloud: builds + cloud agent
npm run broker       # optional: off-device Python/Go runs
npm run dev:bridge   # optional: opencode file bridge
npm run dev:opencode # optional: opencode agent
```

Point the browser at them:

```bash
# .env.local
VITE_BROKER_URL=https://broker.example.com
VITE_OPENCODE_URL=https://agent.example.com
VITE_OPENCODE_BRIDGE_URL=https://bridge.example.com
```

When exposing the bridge to a network, set a shared secret so only your IDE can call it:

```bash
ZUT_BRIDGE_TOKEN=$(openssl rand -hex 32) npm run dev:bridge
```

and put the matching value in `VITE_OPENCODE_BRIDGE_TOKEN`. The bridge binds
`127.0.0.1` by default; set `ZUT_BRIDGE_HOST=0.0.0.0` behind a TLS reverse proxy (and always keep the
token set when you do). The broker does not use a static browser token: every request carries the
signed-in user's token, which the broker verifies.

## Notes & limitations

- To preserve script ordering, the bundle is inserted at the position of the last referenced
  `<script src>` tag — real-world CDN scripts placed before it still run in order.
- External imports (`import x from 'https://...'`) are allowed but subject to the CDN's CORS.
- A project is single-user; no real-time collaboration (yet).
- Monaco is bundled locally (no CDN at runtime), so the first load is a bit heavier but works offline.
- **Deploy → Vercel** uses the `vercel-deploy` Edge Function above and requires sign-in. Deploys are
  inlined static builds (or `npm run build` when a `package.json` with a build script / Vite is
  present); for heavy apps prefer linking the pushed GitHub repo inside Vercel instead.
- **GitHub push** uses a PAT entered in the IDE (stored in this browser) and updates the selected
  branch. It never deletes remote files that are absent locally; remove them on GitHub if needed.
- **AI** is optional and works two ways: bring your own key (OpenRouter/Anthropic/OpenAI/Gemini, stored in this
  browser, billed by that provider) or sign in to use the zut cloud proxy. The self-hosted agent
  option runs opencode on a server. Coding, running, and deploying all work with no AI.
- **Programs** (Python/Go) run through the broker (`VITE_BROKER_URL` → `npm run broker`); without it they show a hint instead of running. Staged status (`Waking…/Starting…`) + Cancel, 60s browser wait cap, plain-words quota (`402` → "run time used up"). Service keys stay on the broker; the browser sends only the user token. See `broker/README.md` for env + smoke test.
- Importing some dynamic pages may fail if the site blocks cross-origin fetches or requires JS
  rendering. CodePen, raw GitHub, and plain HTML/CSS/JS pages work best.

## Structure

```
src/
  App.tsx                # 3-pane shell, sessions, runs, preview, modal wiring
  main.tsx               # root render + crash boundary
  index.css              # Tailwind v4 + Inter/JetBrains + scrollbars (no config file)
  types.ts               # agent/diff/session/check types + preserved backend contracts
  components/ErrorBoundary.tsx # crash fallback (Reload IDE)
  components/Sidebar.tsx       # traffic lights, New Agent, search, agents, files, profile
  components/ComposerPane.tsx  # agent feed + follow-up bar + commit/review actions
  components/DiffReviewPane.tsx# file diffs, terminal drawer (the pane header lives in App.tsx)
  components/CodeEditorPane.tsx# Monaco tree + tabs + inline prompt + status bar
  components/LiveAppPreviewPane.tsx # sandboxed iframe + viewports + console drawer
  components/TestExplorerPane.tsx  # run checks (run history as pass/fail rows) + agent fix
  components/TerminalDrawer.tsx    # benchmarks / terminal / logs tabs
  components/CodeLine.tsx + SplitDiffViewer.tsx # unified + side-by-side diff rows
  components/*Modal.tsx  # CommandPalette, NewAgent, VideoPreview, PR, PRReviewStudio,
                         # VercelDeploy, History, Share, GitHubPush, Import,
                         # LoginAndAccount, Rules, Host, HostGit
  components/DebugPanel.tsx # call stack / scopes / breakpoints for the host debugger
  adapters/              # UI-facing backends: zut (broker + Supabase + drafts),
                         # preview (esbuild bundle), filemap, aiEdits, gemini,
                         # providers, github, githubRepo (repo import),
                         # localRepo (File System Access), mudauth, importer,
                         # opencode
  lib/                   # app model + broker URL + host client + debug client +
                         # connectors/secrets/terminal
  hooks/                 # remote shell, wallpaper, pane widths
terminal/                # zut-term: the IDE in the terminal (pixel, own package)
  bin/zut-term.mjs       # launcher entry → serves the app, execs pixel
  src/options.ts         # argument parsing (pure)
  src/server.ts          # app server lifecycle (vite preview / dev)
  src/launcher.ts        # plain-node launcher
  src/main.tsx           # pixel entry: root + global keys
  src/ZutApp.tsx         # native status bar + the IDE as a WebView
broker/
  server.mjs             # thin broker (npm run broker): BaaS routes + run/terminal/preview
  cells.mjs              # ONLY file that speaks Cells (env-driven, VERIFY markers)
  lib.mjs                # pure guards (segments, paths, hash diff, batching)
  README.md              # env table, curl smoke, go-live checklist
host/                    # zut host (npm run host): workspace files, git, pty, debugger
  server.mjs             # HTTP + WebSocket entry (selfhost/hosted modes)
  files.mjs              # bounded text read/write + change stamp, symlink-safe
  git.mjs                # allow-listed git argv (status/diff/log/commit/checkout)
  debug.mjs              # Node inspector (CDP) bridge for the Debug drawer
  lib.mjs                # pure path/ignore/git-status helpers
runtime/server.mjs       # self-hostable compute service (/build + /run, native esbuild + python3/go)
cloud/server.mjs         # zut-cloud: builds + runs + headless agent turns
scripts/file-bridge.mjs  # syncs the project to disk for the opencode agent
landing/               # static marketing site (Cursor-style, light/dark, waitlist
                       # forms, product screenshots); deploys to Vercel with no build
supabase/schema.sql      # tables + RLS + share RPCs
supabase/schema_zut.sql  # zut tables + RLS + zut_connections (Vercel token)
supabase/waitlist.sql    # waitlist table + insert-only RLS + Sendliberty welcome trigger
supabase/functions/
  _shared/               # auth, GitHub, Vercel helpers
  vercel-deploy          # create deployment from project files (the only one used)
  oauth-*, github-push, connections, claude  # legacy, not called by the client
  claude                 # Anthropic proxy (server-side key, streaming)
  connections            # list / disconnect linked accounts
```