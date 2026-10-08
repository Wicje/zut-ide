# DESIGN.md — zut IDE

> Living style contract for humans + AI agents. Change the UI only in ways
> that keep every section below true. (Format borrowed from designmd.supply:
> tokens first, components second, voice last.)

## Brand

- **Name:** zut, always lowercase. Single public name: zut.
  Folder/repo names (`chisom_ide`, `zut-ide`) never appear in UI.
- **Positioning:** "Code from any device." An AI-powered code editor for phones
  and sub-2GB Chromebooks/gadgets, not a desktop replacement. AI is optional —
  plain code + Run is the default path.
- **Backend is invisible:** built on Mudbase, but UI says Run / Terminal / Preview.
  Never expose Cells, Small-hours, externalId, session ids, or quota internals.
  Trust line: "Your code lives in your private project. Editing is free — only runs use run time."
- **Personality:** quiet workshop, not neon arcade. The UI recedes; the user's
  code and preview own the pixels.

## Palette (light, refined)

Light-only: no `.dark` class, no toggle. Soft gray app shell, white panels and
cards, subtle borders, crisp monospace code. Prefer boring utilities on
positioning-critical elements; Tailwind v4 exotic syntax (`w-(--…)`,
`origin-(…)`) is decoration-only — it once broke menu widths.

| Token | Value | Use |
|---|---|---|
| `background` | `oklch(0.955 0 0)` | app shell |
| `card` | `oklch(1 0 0)` | panels, composer, editor chrome |
| `muted` | `oklch(0.93 0 0)` | chips, pills, output wells |
| `border` | `oklch(0.89 0 0)` for dividers | never full-contrast lines |
| `emerald-600` | **the** accent | Run, success, added-lines |
| `red-600 / destructive` | errors only | build failure, removed-lines, delete |
| `amber-600` | warnings + transient | building state, key-missing dots |
| `violet-500` | AI only | agent dots, proposal cards, file chips |
| `sky-600` | navigation | clickable file links in console |
| Console levels | `log #1f2937 · info #0369a1 · warn #b45309 · error #dc2626 · debug #6b7280` | always paired with a dot + text label, never color alone |
| Code | Monaco `vs` (light), red/green diff | read-only diffs, light editor |

One accent per meaning. Emerald = go/success, red = broken, amber = wait,
violet = AI. Do not add new accent hues without updating this table.

## Typography

- **UI:** `Geist Variable` (`--font-sans`). Panel headers: `text-xs font-medium uppercase tracking-wider text-muted-foreground`.
- **Code/paths:** monospace for file names, counts, status values, console.
- **Editor:** Monaco `vs` (light), 14px, minimap off, word wrap on. Diffs read-only, side-by-side.

## Shape & elevation (Linear-quiet)

- Radius: `rounded-md` rows/chips, `rounded-lg` menus, `rounded-xl` proposal cards.
- Panel headers `h-9/10`, toolbar `h-12`, status bar `h-7` — headers whisper (`uppercase text-xs muted`), content speaks.
- Menus: `bg-popover ring-1 ring-foreground/10 shadow-md`, items `cursor-pointer`.
- Active file: accent wash + 2px emerald edge bar (not just bold text).

## Layout grammar (VS Code-like)

```
┌────────────────────────────────────────────────────────────┐
│ sidebar  │ composer            │ SCM bar: project · +A -D · Run PR Push │
│ 280px    │ 360–420px          ├────────────────────────────┤
│ ●●● search│ session ▾ · New   │ tabs: file · Changes (N)   │
│ +New Agent│ request box       │                            │
│ Automations│ file/run chips   │ code editor / multi-diff   │
│ Customize │ recording · summary│                           │
│ Agents ☉  │ chat              ├────────────────────────────┤
│ Project ▾ │ follow-up bar:    │ preview + console          │
│ History   │ +A -D · Push · model · mic                     │
│ profile   │                   ├────────────────────────────┤
├───────────┴───────────────────┴────────────────────────────┤
│ status: run-state · project · files · errors               │
└────────────────────────────────────────────────────────────┘
```

- Desktop grid: sidebar / composer / editor+output. No top toolbar on desktop
  (mobile keeps it); SCM bar + sidebar menus own every action. Composer
  collapses via Customize or `Ctrl+K`; do not widen chrome at the editor's
  expense.
- Sidebar: traffic lights (chrome) + search (agents & files) + New Agent /
  Automations / Customize. Agents group (sessions, active dot, delete),
  Project files (search-filtered), History row, profile footer (avatar,
  account, runs today). Labels stay zut-real — never borrow another
  product's workspace names.
- Composer: session feed (request box, changed-file + run chips, screen
  recording, summary) above the chat; follow-up bar with review pill,
  Commit & Push (save → publish), backend picker, voice input. Recording
  stays in-browser; nothing uploads.
- Right: SCM bar (project switcher, uncommitted badge, Run, Create PR =
  review link, Commit & Push = save + publish), Code / Changes tabs.
  Changes is a multi-file collapsible diff vs the last snapshot, rendered
  lazily per file. Edits happen in Code.
- Mobile (`≤860px`): single pane + 4-tab dock (Code / Result / Files / AI),
  file strip on top, `env(safe-area-inset-bottom)` respected. Composer is a
  full-screen overlay on mobile.
- Status bar (desktop only): run state · project+saved · file count · active
  file · error count (clickable) · build location (cloud/local).

## Components

- **Run:** solid emerald, always visible, `Ctrl+Enter`. Preview empty state
  offers the same Run — there is exactly one primary action.
- **New:** one click = blank canvas (minimal HTML + CSS + JS). No template
  maze — devs add files via explorer +. Starters/playgrounds/frameworks live
  behind the chevron, each with a one-line description. Guarded by confirm
  only when unsaved changes exist.
- **Save:** ghost, `Ctrl+S`. Dirty = amber dot + "unsaved" in titlebar *and*
  status bar. Never silent destructive actions: New/Import/Restore announce
  to the console (`Created "x" with N files.`).
- **Save model:** one home per sign-in state — device (logged out) or cloud
  (logged in + project). Status bar names it (`saved · cloud/device`). No
  surprise downloads: ZIP only on explicit click; History snapshots are the
  safety net, with a pre-wipe checkpoint before every New/Import/Restore.
- **Deploy dialog:** Netlify one-click is the whole default view. GitHub,
  Vercel, Serverless and Check live behind an Advanced toggle that only
  appears when configured.
- **Menus:** pointer cursor, icons muted, destructive items red. File-type
  rows: badge + name + rename/delete always visible on touch
  (`md:` hover-reveal only with a mouse), rows keyboard-focusable.
- **Console:** level = dot + label + message; file refs dotted-underline,
  click jumps to file+line and switches to Code view on mobile.
- **Preview:** header reads `Preview` + viewport chip (`375/768/Full`) +
  status pill (`Not run yet / Waking… / Installing… / Starting… / Running / Build failed`) +
  access badge (`private` default, `public link` only when shared) + Cancel while running.
  Local web = `srcDoc` iframe; remote dev server = `previewUrl` iframe. Same chrome.
  Non-web projects use the same slot: `RunOutput.tsx` shows `Output` + language
  chip (`Python/Go`) + `exit N · Nms`, with stdout/stderr and an stdin box.
  First run warns: "First run can take up to ~20s while the computer wakes."
  One component, mobile and desktop — no separate mobile output.
- **Write-back is explicit:** runs/agents never silently overwrite source.
  Changed files show a diff + Accept. Receipts are counted ("applied N file changes").
- **AI:** violet spark; backend tabs show key-missing amber dots and
  server-status dots. Cloud agent edits apply with a counted receipt
  ("applied N file changes"). AI never blocks coding: Run/Save/Format/Deploy
  work with no key.
- **Project kind:** `index.html` = web, else `main.py` = Python, `main.go` = Go
  (`src/lib/projectKind.ts`). Kind decides the Output slot, never the chrome.

## Voice

- Friendly + plain: "Click Run to see your page here.", "No output yet."
- Errors say what + where: `Build error (line x:y)` with a clickable jump.
- Programs without a runner say what to do: "Python/Go need the remote runner (set VITE_RUNTIME_URL to your broker)."
- Quota says plain words: "Run time used up for today — try again tomorrow or ask for a higher quota." Never `402`, `Small-hours`, `allowance`.
- Infra words (`VITE_*`, Cells, externalId, session ids, callback URLs, meter logs) never surface in UI.

## Non-goals

- No new toolbar buttons without a home in mobile (every desktop action must
  degrade: hide with reason, or live in the dock/dialogs).
- No color-only signalling (dots + labels), no hover-only controls on touch,
  no `window.confirm/prompt/alert` anywhere — destructive flows use
  `ConfirmDialog.tsx`, explorer delete is two-tap, rename is inline.
- No new eager imports for behind-a-click panels — `AiPanel`, `DeployDialog`,
  `HistoryDialog`, `ProjectList` stay `React.lazy` so phones load editor first.
