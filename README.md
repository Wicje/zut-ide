# zut — a student web IDE for HTML / CSS / JavaScript / TypeScript

A browser-based IDE for teaching web development. Students edit files in a VS Code–style editor
(Monaco), hit Run, and see the result in a live preview with a real console that captures
`console.log`, warnings, runtime errors and build errors.

- **Editor**: Monaco (VS Code's editor) with IntelliSense and red-squiggle type errors for JS/TS.
- **Multiple files**: `index.html`, `style.css`, `script.js`, `script.ts`, JSON, text — anything.
- **Mobile friendly**: below ~860 px the IDE becomes a scrollable file-tab strip with a Code /
  Result / Files dock at the bottom — so students can tinker from a phone or tablet too.
- **Real projects**: JS/TS files can `import`/`export` across files. `.ts`/`.tsx` is compiled in
  the browser with **esbuild-wasm**.
- **Framework templates**: *New ▾* includes starter projects for **React** and **Vue** (which run
  live in the preview — React/vue packages are pulled from the esm.sh CDN and `.vue` single-file
  components are compiled in-browser with `@vue/compiler-sfc`), plus **Next.js**, **Express** and
  **NestJS** projects for teaching server-side code.
- **Preview + console**: code runs in a sandboxed `<iframe>`; `console.log`, warnings, DOM errors
  and unhandled promise rejections are streamed into a console panel.
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

1. `index.html` is the app entry point.
2. `<link rel="stylesheet" href="...">` and `<script src="...">` tags pointing at project files are
   collected, then all JS/TS/CSS is bundled with esbuild (browser, IIFE). TS type-checking is done
   live by the editor; esbuild strips types for execution.
3. The bundled JS/CSS is inlined into a self-contained HTML string rendered in a sandboxed `<iframe>`
   (`allow-scripts`, no `same-origin` → the preview cannot touch the app).
4. A tiny harness inside the iframe reroutes `console.*`, `window.onerror` and
   `unhandledrejection` back to the IDE via `postMessage`.

Build errors (missing files, syntax errors, bad imports) are shown as red entries in the console.

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
- **AI** runs on your Anthropic key at your cost. The button requires signing in (to attribute usage).
- Importing some dynamic pages may fail if the site blocks cross-origin fetches or requires JS
  rendering. CodePen, raw GitHub, and plain HTML/CSS/JS pages work best.

## Structure

```
src/
  App.tsx                # routing, run loop, autosave, cloud sync, feature wiring
  lib/runner.ts          # esbuild bundling + srcdoc + console harness
  lib/backend.ts         # Supabase + localStorage persistence
  lib/supabase.ts        # client init / config check
  lib/templates.ts       # starting templates
  lib/download.ts        # ZIP export
  lib/deploy.ts          # Netlify one-click deploy
  lib/hosting.ts         # Edge Function client (OAuth, GitHub push, Vercel, Claude)
  lib/importer.ts        # import project from URL (HTML/CodePen/GitHub)
  lib/formatter.ts       # Prettier formatting
  store/workspace.tsx    # files / console / project state
  components/
    CodeEditor.tsx       # Monaco wrapper (language per extension)
    FileExplorer.tsx     # add / upload / drop / rename / delete files
    Preview.tsx          # sandboxed iframe + status + viewport toggle
    ConsolePanel.tsx     # console + error streaming
    Toolbar.tsx          # run / autosave / save / share / zip / deploy / AI
    Login.tsx, ProjectList.tsx, ShareDialog.tsx
    DeployDialog.tsx     # Publish hub: GitHub push, Vercel, Netlify
    AiPanel.tsx          # Claude chat assistant
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