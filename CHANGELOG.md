# Changelog

All notable changes to zut. Format: `Added / Changed / Fixed` under `Unreleased`,
moved to a version section on release.

## [Unreleased]

### Added (2026-10-20 — the IDE in the terminal)
- `zut-term`: the Zut IDE runs inside a terminal window, painting real pixels
  over the kitty graphics protocol with
  [`@zenbu-labs/pixel`](https://pixelgui.com).
  The IDE itself is a WebView, so every pane, modal and editor is the real
  app. New `terminal/` package (own install, so the root stays light) plus
  `npm run term`, `npm run term:setup`, `npm run term:build`. The launcher
  serves the production build (rebuilding when `dist/` is missing), can reuse
  a server that is already up, and offers `--dev`, `--url`, `--port`,
  `--rebuild`.

### Changed / Fixed (2026-10-20 — one theme, one control language)
- `dark:` Tailwind utilities now follow the in-app theme toggle instead of
  `prefers-color-scheme`. Previously 184 utilities across 22 components
  disagreed with the `isDark` ternaries, so an OS-dark machine with the app
  in light mode rendered a half-and-half UI.
- Buttons no longer carry borders. Pills and buttons use a filled surface
  (light `bg-[#f4f4f6]`, dark `bg-[#24242a]`) instead of a border over a
  background — one secondary-button recipe everywhere.
- Solid primary buttons dropped the redundant same-colour border, which was
  invisible but shifted the box by 2px.
- One focus treatment everywhere: `focus:ring-1 focus:ring-red-500`.
- Tab underlines use one red in both themes instead of two.
- Off-system accents removed: the landing orange in the waitlist gate, the
  green language badge in the editor, the green "no checks recorded yet"
  empty state, and the green glow on agent replies. A merged pull request
  reads as success (green) rather than error (red).
- Border colours consolidated onto the `DESIGN.md` tokens; the last
  near-duplicate hexes are gone.
- `DESIGN.md` gained a Controls section (primary / secondary / focus / borders
  / status surfaces) and the theme-mechanism note.

### Changed / Fixed (2026-10-20 — workspace safety)
- Host workspace reloads external edits (3s stamp poll) without clobbering
  pending local writes; local folder reloads snapshot first.
- `git commit` in the host now stages only visible paths (`git add -A --`), so
  `.env*`, `node_modules`, build output, and binaries can never be committed;
  deletions of visible files still stage correctly.
- Lockfiles now sync to host workspaces; `.env*` remains excluded from local
  host sync, repo import, and AI context.
- Fixed debug session ownership: a failed `start()` no longer wedges the host,
  and closing one debug socket cannot stop another viewer's session.
- Host `/health` hides the absolute workspace path unless the request is
  authorized; remote hosts now explain `CORS_ORIGIN` errors.
- GitHub repo import resolves `/tree/<ref>/<path>` URLs (tries long refs first,
  then folder prefixes) and skips secrets.
- Host URLs typed in the connect dialog are normalized before testing/saving.

### Added (2026-10-12 — landing relaunch + waitlist)
- Landing relaunched dark Cursor-style ("Where sentences become software"):
  hero with overlapping product screenshots, alternating feature rows, wall of
  love, changelog, team block, full footer; light/dark toggle (stored, OS-aware,
  no flash); gradient headline; staggered card entrances; hero 3D tilt; cursor
  spotlight on cards; scroll progress bar; recognition favicon.
- Waitlist capture on hero + final CTA: email validation, loading/success states,
  duplicate handling; inserts to `waitlist` via anon key (insert-only RLS).
- `supabase/waitlist.sql`: one-run setup — table, RLS, vault-stored Sendliberty
  key, trigger sending a plain-text welcome email (Gmail-routed, no domain).
  Email failures can never block a signup.
- Landing deployed to Vercel production (static, no build):
  https://landing-two-beta-xy9r9089if.vercel.app

### Added (2026-10-10 — Zut pilot batch)
- Zut identity: product renamed everywhere (tab, manifest, PWA, docs),
  Cursor/Anysphere branding purged, red Cursor-style accent across all of
  `src/`, DESIGN.md contract updated.
- Blank-by-default workspaces; sessions + chats persist across reload;
  snapshots capped and quota-safe; sign-in backs up device work first.
- File ops: rename (inline), duplicate, delete (confirmed), new file/folder
  with rename-into-place; all snapshot History first.
- Responsive shell: mobile single-pane + bottom nav, tablet rails, `100dvh`,
  full-screen modals, scrolling pane headers, hover overflow menu in Diff.
- Dev connectors (BYOK, browser-only): Vercel, GitHub, Cloudinary, Supabase,
  Pexels — account section, explorer upload, agent prompt awareness.
- Vercel-only deploys via edge function (signed-in users, token validated +
  stored server-side); Netlify anonymous path removed.
- Industry-standard GitHub push: create-if-missing, single tree commit,
  feature branches, conventional messages, real pull requests.
- Agent upgrades: image attachments (multimodal on Gemini/OpenRouter/Claude/
  ChatGPT), opencode model picker (free-first + custom IDs), turn ratings,
  loud failure states (missing key opens account settings).
- Localhost locked down: bridge + runtime tokens, one-command
  `scripts/start-local.ps1`, Sentry wiring (env-gated).
- Landing page (`landing/`, Notion-style, real screenshots) + Notion-style
  sign-in/register pages; de-pilled action buttons; collapsible sidebar;
  wallpaper picker; working mic error states.

### Added
- Composer Ghost UI port (pixel-perfect): wallpaper stage + resizable
  sidebar/composer/right shell (Diff/Editor/Preview/Checks), 13 modals, light
  + dark themes, `src/adapters/*` UI backends. `lib/ hooks/ store/ broker/
  runtime/ cloud/ supabase/` preserved; backend types appended to `types.ts`.
- New Agent starts a fresh instance (snapshot-then-reset; stale agent turns
  can't clobber it via a generation guard).
- Tightening: crash boundary, undo-safe revert/rollback, Esc closes all
  modals, PWA rebrand (manifest + icon), honest Run Checks pane (run records,
  assertion diffs only for real assertions).
- CI: broker syntax checks + no-deleted-shadcn-layer contract. Pages deploy
  bakes `VITE_BROKER_URL` so the deployed site can run code.

### Added
- Light 3-column shell rebuilt from scratch: sidebar (traffic lights, search, New Agent/Automations/Customize, agent sessions, searchable files, profile), center composer (session feed with request box, file/run chips, in-browser screen recording, summary + follow-up bar with review pill, Commit & Push, backend picker, voice input), right pane (SCM bar with project switcher, uncommitted badge, Run, Create PR review link, Commit & Push; Code/Changes tabs; lazy multi-file diff vs snapshot).
- Composer sessions (`lib/composers.ts`): multiple named agents, per-session persisted history, auto-titles, backend remembered per agent.
- AiPanel as embeddable engine (ref send/focus/clear/setBackend, hideable header/input, session persistence hooks).
- Light-only theme (soft gray shell, white cards, Monaco `vs`, light console/output palettes). No `.dark`, no toggle.
- Thin broker (`broker/server.mjs`, `npm run broker`): BaaS routes (projects CRUD, share/shared) + `open/run/stop/terminal-token/preview` with user-token auth (60s cache), daily/rate caps, ownership checks. Live Cells path (resume by `externalId`, hash-diff sync ≤200, exec, 60s terminal tokens, preview expose) isolated in `broker/cells.mjs` behind env; local demo runs when no key is set.
- Staged runs: `waking/installing/starting/running/ready` (`RunStage`), Cancel, 60s browser wait cap, quota → plain words. Wired through `useRunLoop`, `RunOutput`, `Preview` (remote-URL + private/public badge), `StatusBar` (`remote runner · N/50`).
- Pilot cost trail: `lib/limits.ts` (single caps source), `lib/usage.ts` (offline mirror), `UsagePanel` (runs, Small-hours est, quota) + `Runner` tab in Deploy dialog with `TerminalPanel` (60s token lifecycle).
- Swappable persistence: `BackendProvider` contract + broker-first `backend.ts` (broker BaaS → Supabase → local), `canAccessWorkspace`/`hashFile`/`batchFiles` helpers with isolation tests.
- Heavy dialogs code-split (`AiPanel`, `DeployDialog`, `HistoryDialog`, `ProjectList` via `React.lazy`).
- `ConfirmDialog`: zero `window.confirm/prompt/alert` left — two-tap delete + inline rename in explorer, in-app confirms in toolbar/Mudbase.

### Fixed
- Remote preview iframe sandbox regression (`allow-same-origin` removed).
- Share links are clean `#/p/<token>` (no `?ref=share`).

### Added
- Polyglot programs: Python (`main.py`) + Go (`main.go`) starters, `detectProjectKind` entry routing, unified `RunOutput` (iframe for web, terminal + stdin for programs) on mobile and desktop.
- Remote execution: `POST /run` on `runtime/server.mjs` + `cloud/server.mjs` (`python3` / `go run`, 8s timeout, 256KB output cap, stdin support). Programs need `VITE_RUNTIME_URL`.
- Render-ready cloud image: `python3` + `golang-go` in `cloud/Dockerfile`, `$PORT`-compatible, `/health` reports `runners`.
- Docs repositioned: phones + <2GB gadgets (not students/classroom), AI-optional, web vs program execution contracts.

### Added
- zut-cloud: single VPS backend (remote builds + headless agent turns) with
  Supabase-JWT auth, per-user workspaces, quotas, and Docker/Caddy deploy kit.
- Status bar (desktop): run state, build time, project + save location,
  error count, cloud/local build indicator.
- Pre-wipe checkpoints before New / Import / Restore (recoverable in History).
- Share auto-saves first; shared links are `#/p/<token>`; shared view has a
  "Remix in zut" CTA.
- AI panel: free-plan usage meter (`N / 50 turns`), Cloud-agent backend.
- DESIGN.md style contract; CONTRIBUTING.md; `cloud/RUNBOOK.md` (VPS incidents).

### Changed
- New is one-click blank canvas; starters live behind the chevron.
- File explorer: name-at-creation, touch-visible actions, keyboard rows.
- Autoplay rebuilds only when build inputs change (index.html + references).
- Heartbeat ZIP auto-downloads removed; ZIP is explicit-only.
- Deploy dialog: Netlify-first, advanced targets gated.
- GitHub Pages build bakes `VITE_CLOUD_URL` when the repo secret exists.

### Fixed
- Dropdown menus never opened: ui Button/Input/Badge/Textarea now forward
  refs (React 18 drops plain-function refs, so Radix triggers never anchored).
- `loadFiles` ignored the `activeFile` option.
- `run()` wiped fresh action receipts; recent info messages now survive.
- Toolbar overflow overlap on 390px screens.
