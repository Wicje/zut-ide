# Changelog

All notable changes to zut. Format: `Added / Changed / Fixed` under `Unreleased`,
moved to a version section on release.

## [Unreleased]

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
- Share auto-saves first; shared links carry `?ref=share`; shared view has a
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
