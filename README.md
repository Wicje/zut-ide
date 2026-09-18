# zut — full coding on a Chromebook or phone. Nothing to install.

A browser IDE + optional cloud backend for people on phones, Chromebooks, and
other gadgets with &lt;2GB RAM. Edit files, hit Run, see the result — on hardware
that could never run a local toolchain. Heavy work (builds, program runs, AI
file edits) runs on zut-cloud; the device just renders the UI.

AI is optional: plain code + Run works with no key, no sign-in, no server.
When you want it, bring your own key or use the cloud agent.

- **Editor**: Monaco (VS Code's editor) with IntelliSense and red-squiggle type errors for JS/TS.
- **Multiple files**: `index.html`, `style.css`, `script.js`, `script.ts`, `main.py`, `main.go`, JSON, text — anything.
- **Mobile + desktop**: one UI that fits both. Below ~860 px the IDE becomes a scrollable file-tab strip with a Code /
  Result / Files dock at the bottom; on desktop it's explorer / editor / output + console. Same RunOutput component either way.
- **Web projects**: JS/TS files can `import`/`export` across files. `.ts`/`.tsx` is compiled in
  the browser with **esbuild-wasm**.
- **Python + Go**: *New ▾ → Languages* includes `main.py` and `main.go` starters. Programs execute on the remote runtime (`POST /run`) so weak devices never compile locally. Stdin is built into the Output panel.
- **Framework templates**: *New ▾* includes starter projects for **React** and **Vue** (which run
  live in the preview — React/vue packages are pulled from the esm.sh CDN and `.vue` single-file
  components are compiled in-browser with `@vue/compiler-sfc`). Server frameworks (Next.js / Express / NestJS)
  are compile-checked only, not executed — use the Deploy dialog hints or a Mudbase function for a real backend.
- **Preview + console**: web code runs in a sandboxed `<iframe>`; `console.log`, warnings, DOM errors
  and unhandled promise rejections are streamed into a console panel. Python/Go output (stdout/stderr + exit code) renders in the same Output panel as terminal text.
- **Persistence**: works out of the box with zero backend (localStorage draft). Optionally connect
  **Supabase** for accounts, cloud save, a project library, and read-only share links.
- **Save to disk**: download any project as a ZIP.

## Feature highlights

- **Auto formatter** — the *Format* button runs Prettier (in-browser) on the active HTML/CSS/JS/TS/JSON file.
- **File upload & drop zone** — drag files onto the file explorer or use ↑ to upload images (as data URLs),
  fonts, JSON, and code files from your device.
- **Multi-viewport preview** — on desktop, switch the result between phone (375px) / tablet (768px) /
  full width to test responsive layouts without leaving the IDE.
- **Import from URL** — *New ▾ → Import from URL* accepts an HTML page, a CodePen, or a raw GitHub file,
  and scaffolds a project from it.
- **One-click deploy** — the *Deploy* button zips the project and publishes it to a free, live Netlify URL
  (visitor-created sites via Netlify's open API).
- **GitHub push** — sign in and connect your GitHub account, then publish any project as a new (private or
  public) repository. It's created and pushed for you.
- **Vercel deploy** — connect your Vercel account and push the project straight to a live `.vercel.app` URL.
  Next.js projects are auto-detected and built on Vercel.
- **Server compile-check** — for Express / NestJS / Next.js projects, the *Deploy* dialog can
  compile-check your server entry (`src/main.ts`, `server.js`, …) in the browser without a Node
  runtime, surfacing syntax and import-graph errors before you push.
- **AI assistant** — the *✨ AI* button opens a chat with Claude that can see your project (files + the active
  file) and answer coding questions; the API key stays on the server.
- **Quick-switch gestures** — on mobile, swipe left/right on the file-tab strip to cycle files.
- **Collapsible console** — on mobile the result view folds the console into a drawer so the preview keeps
  the whole screen.

## Quick start

```bash
npm install
npm run dev        # → http://localhost:5173
```

The app runs fine with no configuration — try it before touching Supabase.
"New project" → pick a template, edit, watch the preview, open the console.

## Production build

```bash
npm run build && npm run preview
```

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| `Ctrl/⌘ + Enter` | Run (preview for web, execute for Python/Go) |
| `Ctrl/⌘ + S` | Save (device, or cloud when signed in) |
| `Ctrl/⌘ + K` | Toggle AI assistant (optional) |

## Optional: remote runtime (build + run on a server, not the phone)

By default web projects are bundled in the browser with esbuild-wasm. On low-end
machines (phones, &lt;2GB Chromebooks) you can move that work to a server instead.
Python/Go **always** need the server — they never execute on-device:

```bash
npm run runtime            # → http://localhost:8787  (PORT to change)
```

Then point the IDE at it:

```bash
# .env.local
VITE_RUNTIME_URL=http://localhost:8787
```

When `VITE_RUNTIME_URL` is set, the browser POSTs the project's files to
`/build` (web) or `/run` (Python/Go with optional stdin) and renders the result.
If the service is unreachable (or the project uses `.vue` files, which still need
the browser compiler), web falls back to the in-browser runner automatically;
programs show a "needs runtime" hint instead of failing silently. Run the service with
`ZUT_RUNTIME_TOKEN=...` and set `VITE_RUNTIME_TOKEN` to require a shared secret.
Tune with `ZUT_RUN_TIMEOUT_MS` (default 8000) and `ZUT_RUN_MAX_OUTPUT` (default 256KB).

Short-term host: Render.com works for a few days — deploy `cloud/Dockerfile` as a
Web Service (Starter 2GB, health check `/health`), set `CORS_ORIGIN` to your
frontend, then use its URL as `VITE_RUNTIME_URL` / `VITE_CLOUD_URL`. See
[cloud/DEPLOY.md](cloud/DEPLOY.md) for VPS vs Render notes.

## Optional: serverless backend (Mudbase, key never in the browser)

The **Deploy → Serverless** tab ships a project file as a Mudbase function with a
live endpoint. Recommended setup — the key lives on your server:

```bash
ZUT_MUDBASE_API_KEY=... ZUT_MUDBASE_PROJECT_ID=... npm run runtime
```

```bash
# .env.local
VITE_RUNTIME_URL=http://localhost:8787
VITE_MUDBASE_PROXY_URL=http://localhost:8787/mudbase
```

Every proxy call is logged with timing (`mudbase METHOD /path ok Nms`) — the raw
material for metering paid deploys later.

Personal/local use only: skip the proxy and put a **functions-scoped** key in
the browser bundle. Mint it at [mudbase.dev/console](https://www.mudbase.dev/console)
(Settings → API Keys) with ONLY `functions` create/read/update/delete on one
project, then **revoke any full-access key**. Never commit a real key — and note
that minting keys needs org-level login; an API key cannot mint new keys.

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
   if you want to hand-pick student accounts.

How saving works:

- Logged out → edits autosave to this browser (localStorage).
- Logged in → **Save** creates a cloud project; after that edits autosave to the cloud (1.5 s debounce).
- **Share** on a cloud project generates a read-only link `…#/p/<token>`. Viewers open a sandboxed,
  read-only copy — they can't edit or see your account.

## Optional: deploy the backend (GitHub push, Vercel deploy, AI assistant)

These features run through Supabase Edge Functions. OAuth tokens and your Anthropic API key live on the
server only; the browser never sees them.

1. Make sure Supabase is configured (previous section) and `supabase` CLI is installed
   (`npm i -g supabase`).
2. Sign in and link the project:
   `supabase login` then `supabase link --project-ref YOUR_REF`.
3. Create an OAuth app in the provider dashboard so users can "Connect" their account:

   - **GitHub**: github.com → Settings → Developer settings → OAuth Apps → *New OAuth App*.
     Set the callback URL to
     `https://YOUR_REF.functions.supabase.co/oauth-github-callback`.
     You may prefer *Classic* OAuth (the `repo` scope creates and writes repos).
   - **Vercel**: vercel.com → Account → Settings → *OAuth Apps*. Set the callback URL to
     `https://YOUR_REF.functions.supabase.co/oauth-vercel-callback`, and enable scopes for
     deployments + project write.
4. Deploy the functions:

   ```bash
   supabase functions deploy --project-ref YOUR_REF
   supabase functions deploy connections oauth-github-start oauth-github-callback \
     oauth-vercel-start oauth-vercel-callback github-push vercel-deploy claude \
     --project-ref YOUR_REF
   ```

5. Set the secrets (function env vars):

   ```bash
   supabase secrets set --project-ref YOUR_REF \
     GITHUB_CLIENT_ID=... \
     GITHUB_CLIENT_SECRET=... \
     VERCEL_CLIENT_ID=... \
     VERCEL_CLIENT_SECRET=... \
     OAUTH_STATE_SECRET=$(openssl rand -hex 32) \
     ANTHROPIC_API_KEY=...
   ```

   Optional extras: `GITHUB_OAUTH_SCOPES` (default `repo`), `VERCEL_OAUTH_SCOPES`,
   `ANTHROPIC_MODEL` (default `claude-sonnet-4-5`), `ANTHROPIC_MAX_TOKENS`.

6. The app finds the functions automatically from `VITE_SUPABASE_URL`. Reload the IDE, sign in,
   open **Deploy** (GitHub / Vercel) or **✨ AI**.

## How running code works

Project kind is detected from files (`src/lib/projectKind.ts`):
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
renders the browser UI. Run all three server-side pieces on the same machine:

```bash
npm run dev:server   # runtime + file bridge + opencode agent
```

or individually: `npm run runtime`, `npm run dev:bridge`, `npm run dev:opencode`.
Point the browser at them:

```bash
# .env.local
VITE_RUNTIME_URL=https://runtime.example.com
VITE_OPENCODE_URL=https://agent.example.com
VITE_OPENCODE_BRIDGE_URL=https://bridge.example.com
```

When exposing these to a network, set a shared secret so only your IDE can call them:

```bash
ZUT_RUNTIME_TOKEN=$(openssl rand -hex 32) \
ZUT_BRIDGE_TOKEN=$(openssl rand -hex 32) \
npm run dev:server
```

and put the matching values in `VITE_RUNTIME_TOKEN` / `VITE_OPENCODE_BRIDGE_TOKEN`. The bridge binds
`127.0.0.1` by default; set `ZUT_BRIDGE_HOST=0.0.0.0` behind a TLS reverse proxy (and always keep the
token set when you do).

## Notes & limitations

- To preserve script ordering, the bundle is inserted at the position of the last referenced
  `<script src>` tag — real-world CDN scripts placed before it still run in order.
- External imports (`import x from 'https://...'`) are allowed but subject to the CDN's CORS.
- A project is single-user; no real-time collaboration (yet).
- Monaco is bundled locally (no CDN at runtime), so the first load is a bit heavier but works offline.
- **Deploy** uses Netlify's public create-a-site API (no account needed). Sites are public and use a
  random subdomain; it's a great "check out my project" link but not for hosting real apps long-term.
- **GitHub / Vercel** links require the Edge Functions above. Vercel deploys are inlined static builds
  (or `npm run build` when a `package.json` with a build script / Vite is present); for heavy apps
  prefer linking the pushed GitHub repo inside Vercel instead. OAuth uses a popup — allow popups for
  the site.
- **AI** is optional and works two ways: bring your own key (OpenRouter/Anthropic/OpenAI/Gemini, stored in this
  browser, billed by that provider) or sign in to use the zut cloud proxy. The self-hosted agent
  option runs opencode on a server. Coding, running, and deploying all work with no AI.
- **Programs** (Python/Go) need `VITE_RUNTIME_URL`; without it they show a hint instead of running. `/run` is single-tenant with timeout + output caps — do not expose it multi-tenant without a sandbox.
- Importing some dynamic pages may fail if the site blocks cross-origin fetches or requires JS
  rendering. CodePen, raw GitHub, and plain HTML/CSS/JS pages work best.

## Structure

```
src/
  App.tsx                # routing, run loop, autosave, cloud sync, feature wiring
  lib/runner.ts          # esbuild bundling + srcdoc + console harness (web)
  lib/projectKind.ts     # web vs python vs go detection + entry lookup
  lib/runtime.ts         # client for remote /build + /run (weak devices offload)
  lib/ai.ts              # BYOK chat providers (OpenRouter, Anthropic, OpenAI, Gemini)
  lib/opencode.ts        # opencode agent + disk-sync bridge client
  lib/backend.ts         # Supabase + localStorage persistence
  lib/supabase.ts        # client init / config check
  lib/templates.ts       # starting templates (web, React, Vue, Python, Go)
  lib/download.ts        # ZIP export
  lib/deploy.ts          # Netlify one-click deploy
  lib/hosting.ts         # Edge Function client (OAuth, GitHub push, Vercel, Claude)
  lib/importer.ts        # import project from URL (HTML/CodePen/GitHub)
  lib/formatter.ts       # Prettier formatting (web files; py/go run as-is)
  store/workspace.tsx    # files / console / project state
  components/
    CodeEditor.tsx       # Monaco wrapper (language per extension)
    FileExplorer.tsx     # add / upload / drop / rename / delete files
    RunOutput.tsx        # unified output: iframe preview (web) or terminal (py/go)
    Preview.tsx          # sandboxed iframe + status + viewport toggle (web only)
    ConsolePanel.tsx     # console + error streaming
    Toolbar.tsx          # run / autosave / save / share / zip / deploy / AI (optional)
    Login.tsx, ProjectList.tsx, ShareDialog.tsx
    DeployDialog.tsx     # Publish hub: GitHub push, Vercel, Netlify
    AiPanel.tsx          # AI chat: BYOK providers + optional self-hosted agent
runtime/server.mjs       # self-hostable compute service (/build + /run, native esbuild + python3/go)
cloud/server.mjs         # zut-cloud: builds + runs + headless agent turns
scripts/file-bridge.mjs  # syncs the project to disk for the opencode agent
scripts/file-bridge.mjs  # syncs the project to disk for the opencode agent
supabase/schema.sql      # tables + RLS + share RPCs + OAuth connections
supabase/functions/
  _shared/               # auth, OAuth state, GitHub, Vercel helpers
  oauth-github-start, oauth-github-callback
  oauth-vercel-start, oauth-vercel-callback
  github-push            # create repo + push files (Git Data API)
  vercel-deploy          # create deployment from project files
  claude                 # Anthropic proxy (server-side key, streaming)
  connections            # list / disconnect linked accounts
```