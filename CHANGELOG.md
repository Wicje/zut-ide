# Changelog

All notable changes to zut. Format: `Added / Changed / Fixed` under `Unreleased`,
moved to a version section on release.

## [Unreleased]

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
