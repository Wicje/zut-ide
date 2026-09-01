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
  lib/importer.ts        # import project from URL (HTML/CodePen/GitHub)
  lib/formatter.ts       # Prettier formatting
  store/workspace.tsx    # files / console / project state
  components/
    CodeEditor.tsx       # Monaco wrapper (language per extension)
    FileExplorer.tsx     # add / upload / drop / rename / delete files
    Preview.tsx          # sandboxed iframe + status + viewport toggle
    ConsolePanel.tsx     # console + error streaming
    Toolbar.tsx          # run / autosave / save / share / zip
    Login.tsx, ProjectList.tsx, ShareDialog.tsx
supabase/schema.sql      # tables + RLS + share RPCs
```