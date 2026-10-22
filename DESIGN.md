# DESIGN.md — Zut

> Living style contract for humans + AI agents. Change the UI only in ways
> that keep every section below true.

## Brand

- **Name:** Zut. Single public name (tab title, PWA manifest,
  OG tags). Folder/repo names (`chisom_ide`, `zut-ide`) never appear in UI.
- **Positioning:** desktop-class coding in the browser. Heavy work runs on the
  broker; the browser renders. AI is optional — plain code + Run is the default path.
- **Backend is invisible:** built on Mudbase, but UI says Run / Terminal / Preview.
  Never expose Cells, Small-hours, externalId, session ids, or quota internals.
  Trust line: "Your code lives in your private project. Editing is free — only runs use run time."
- **Personality:** quiet workshop, not neon arcade. The UI recedes; the user's
  code and preview own the pixels.

## Palette (light + dark, manual toggle)

Theme lives in `App` state (`light | dark`), drilled as a `theme` prop into
every pane and modal — each renders `isDark` ternaries. No CSS variables file;
tokens are inline.

`App` also writes `data-theme` on `<html>`, and `src/index.css` overrides the
Tailwind `dark:` variant to key off that attribute
(`@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *))`).
Without this, `dark:` utilities follow `prefers-color-scheme` and the two
theming mechanisms disagree. The OS setting never drives the theme.

| Token | Light | Dark | Use |
|---|---|---|---|
| sidebar | `bg-[#f4f4f6]` | `bg-[#141416]` | nav rail |
| panes | `bg-white` | `bg-[#18181b]` | editor, composer, diff |
| headers | `bg-white` / `bg-[#fbfbfd]` | `bg-[#161619]` | `h-10` bars |
| cards/inputs | `bg-[#fafafc]` | `bg-[#1e1e24]` / `bg-[#222228]` | modals, fields |
| borders | `border-[#e5e5e7]` | `border-neutral-800` | dividers, cards |
| text | `text-[#2b2b2f]` | `text-neutral-200` | body |
| diff add | `bg-[#e6ffed]` / chip `bg-[#acf2bd]` | `bg-[#122818]` / chip `bg-[#1b4728]` | added lines |
| diff del | `bg-[#ffeef0]` / chip `bg-[#ffc0c7]` | `bg-[#3b1219]` / chip `bg-[#5c2024]` | removed lines |
| primary | `bg-red-600 hover:bg-red-500` | same | Run, confirm, deploy |
| pass/fail | emerald / red pills | same | checks, tests |
| secondary control | `bg-[#f4f4f6] hover:bg-[#eaeaea]` | `bg-[#24242a] hover:bg-[#2c2c34]` | pills, chips, tabs |

One accent per meaning. Emerald = go/success, amber = wait,
red = primary action (and error states). Do not add new accent hues without updating this table.

A color may not carry a meaning it does not own. A language badge, an empty
state, or a neutral chip is not a success and is not an error — it gets a
neutral surface, not a green or red one.

## Controls

- **Primary:** `bg-red-600 hover:bg-red-500 text-white`. No border — a border
  the same color as the fill is invisible and shifts the box by 2px.
- **Secondary:** filled surface, no border.
  Light `bg-[#f4f4f6] hover:bg-[#eaeaea] text-neutral-800`,
  dark `bg-[#24242a] hover:bg-[#2c2c34] text-neutral-200`.
  Pills and buttons do not carry a border; the fill separates them.
- **Focus:** one treatment everywhere — `focus:ring-1 focus:ring-red-500` on
  inputs, `focus-within:border-red-500` on composed inputs. Not `ring-2`, not
  a ring + border pair, not a neutral ring.
- **Borders** are for surfaces (cards, panels, inputs, dividers), never for
  buttons. Use the `borders` token; do not invent a near-miss hex.
- **Status surfaces** (success / error / waiting callouts) are the one place
  a tinted border is allowed — `border-emerald-500/20`, `border-red-500/20`,
  `border-amber-500/20` over the matching `bg-*-500/10`.


## Type scale

Four sizes. Nothing else — a UI with ten font sizes reads as assembled, not
designed.

| token | px | use |
|---|---|---|
| `t-micro` | 10 | badges, counts, timestamps |
| `t-small` | 11 | labels, secondary text, toolbars |
| `t-body` | 13 | prose, list items, table cells |
| `t-lead` | 15 | section headings, the app name |

`text-[10.5px]`, `text-[11.5px]`, `text-[12.5px]` and friends are drift;
round to the nearest step. Body prose is 13, never 12.5.

## Surfaces

Three layers, no more. Near-duplicate greys (`#141416`, `#18181b`,
`#18181c`, `#1e1e24`, `#1f1f25`, `#202025`, `#222228`, `#24242a` …) are the
other half of the same drift.

| layer | light | dark | use |
|---|---|---|---|
| canvas | `#f4f4f6` | `#141416` | the app stage behind the window |
| panel | `#ffffff` | `#18181b` | panes, the composer, the rail |
| raised | `#fafafc` | `#1e1e24` | cards, dropdowns, the task list |

Anything else must be a tint of one of these, or a status colour from the
table above. Borders are for surfaces, not for buttons.

## Typography

- **UI:** `-apple-system, Inter, SF Pro Text, Segoe UI` (Google Fonts Inter).
  Pane body `text-[13px]`, headers `text-xs`, pills `text-[10.5px]/text-[11px]`.
- **Code/paths:** `JetBrains Mono` (`.font-code`, liga+calt on), diff rows
  `text-[12px] leading-[20px]`.
- **Editor:** Monaco (`vs` light / `vs-dark` dark), minimap off.

## Shape & elevation

- Radius: `rounded-md` chips/inputs, `rounded-lg` cards, `rounded-xl` preview
  canvas, `rounded-2xl` app window + modals, `rounded-full` top bar + toast + pills.
- App window: `w-[96vw] max-w-[1240px] h-[88vh] max-h-[800px]`, wallpaper stage
  behind (macOS light/dark images in `src/assets/images/`), control pill centered
  above the window (never overlapping).
- Pane headers `h-9 px-2 border-b`; resizers `w-1 cursor-col-resize`
  (hover `red-500/50`, active `red-600`, double-click resets 210 / 380).
- Modals: `fixed inset-0 z-50` backdrop `bg-black/50 backdrop-blur-xs`,
  `max-w-md` (simple) / `max-w-lg` / `max-w-2xl max-h-[85vh]` (PR studio).
- Scrollbars: 6px, `rgba(0,0,0,0.15)` thumb, transparent track.

## Brand

- One mark everywhere: hand-drawn black "Z" (`src/assets/zut-mark.png`,
  white variant `zut-mark-white.png`, generator `scripts/make-icons.py`,
  source in `/home/zk3/mac/issues/`). Title bar / auth screens / gate use it
  at 16-28px (invert filter on dark surfaces); PWA icons are the mark in
  white on a `#141416` tile (192/512); the landing nav + footer use the black
  mark with a CSS invert in dark theme.

## Layout grammar (Zut shell)

```
┌ wallpaper stage (wallpaper image, centered content) ────────────┐
│                                        [⌘K Deploy | tabs | theme]│ top bar
│ ┌ app window: sidebar │ composer │ right ─────────────────────┐ │
│ │ 210px (160-320)     │ 380px (260-540) │ Diff/Editor/Preview/ │ │
│ │ ●●● search          │ model ▾         │ Checks tabs          │ │
│ │ + New Agent         │ agent steps     │                      │ │
│ │ Agents · Project    │ summary + copy  │ diff list / editor / │ │
│ │ user footer         │ follow-up bar   │ preview / checks     │ │
│ │                     │ commit / review │ + terminal drawer    │ │
│ └─────────────────────────────────────────────────────────────┘ │
│ [toast bottom-center]              [13 modals fixed inset-0]    │
└──────────────────────────────────────────────────────────────────┘
```

- 3 resizable panes; right pane switches Diff / Editor / Preview / Checks via
  top bar, pane tabs, or `Cmd/Ctrl+1..4`. `Cmd/Ctrl+K` palette, `+N` new agent,
  `+D` unified/split, `+J` terminal.
- Sidebar: traffic lights + search + New Agent; Agents group (sessions) and
  Project files (click → opens in editor); user footer (avatar, account modal).
- Composer: model picker, agent steps timeline, summary, follow-up bar with
  @-mention, commit/review buttons, rules modal entry.
- Right: Diff = per-file accept/revert under the pane header; the header carries
  the switcher, the diff summary, copy-diff, PR and deploy actions;
  Editor = Monaco tree + tabs + inline prompt; Preview = sandboxed iframe +
  viewport switch + console drawer + inspect-to-composer; Checks = run history
  as pass/fail rows with agent auto-fix.
- Every destructive or workspace-replacing action snapshots first (New Agent,
  Import, Restore, revert, rollback) — History is the universal undo.
- New Agent = fresh instance: starter files, cleared sessions/runs/console,
  detached cloud link. Previous work stays one snapshot back.
- No mobile dock: this shell is desktop-first (fixed max window, min pane widths).

## Components

- **Run:** terminal `run [entry]` / `status` / `help`, Checks-pane Run All, and
  deploy/pr-review entry points all funnel to the same executors
  (`executeEntry` → broker `/api/broker/run`, or in-browser esbuild preview).
  Exactly one primary action per surface.
- **New Agent:** one submit = fresh instance (starter files, cleared sessions /
  runs / console, detached cloud link), pre-wipe snapshot kept in History.
  Never silent destructive actions: every reset announces via toast.
- **Save model:** autosave to the active source — device draft (localStorage),
  a local folder (File System Access), a `zut host` workspace, or a cloud
  project. Editor status bar names it (`Saved · cloud/device/disk/host`).
  History snapshots are the safety net.
- **Real files:** "Open folder" (Chromium) and "Open host" (any browser) are
  read/write from day one. External edits reload (local and host); rename/delete
  announce and confirm. `.env*` and generated folders stay out of drafts and AI
  context; lockfiles are synced.
- **Host:** one `zut host` process serves text workspace sync, allow-listed git
  argv, a full-shell pty, and a Node CDP debugger. Selfhost defaults to a full
  shell on loopback; hosted/jailed mode pins cwd and strips the env. The token is
  a shared secret, not a user identity: one host per person/workspace, and never
  bake it into a public `VITE_*` value.
- **Debug:** Monaco glyph-margin breakpoints (F9 too), Debug tab with
  continue/step, call stack, scopes, evaluate, and stdout/stderr. One Node
  session per host; no client-side fake state.
- **Deploy:** Vercel flow modal (build logs → live URL → push-to-GitHub) backed
  by the `vercel-deploy` Edge Function, plus a direct GitHub push modal (token,
  private toggle). Export is the workspace itself (local folder or host).
- **Palette:** `Cmd/Ctrl+K` fuzzy commands (sessions, theme, panes, terminal,
  PR, deploy, account, history, share, import). Pointer cursor, muted icons.
- **Console:** preview drawer streams console/errors; terminal drawer has
  benchmarks / terminal / debug / logs tabs. Without a host the terminal is an
  honest command surface (`run`, `ls`, `cat`, …), never a fake shell. Level =
  dot + label + message.
- **Preview:** sandboxed iframe (`allow-scripts`, no `same-origin`), desktop /
  tablet / mobile widths, console drawer, inspect sends the element to Composer.
  Remote broker URL renders when the broker exposes one.
- **Write-back is explicit:** agent edits land as diffs with per-file
  Accept / Revert (+ pre-revert snapshot). Receipts are counted.
- **AI:** BYOK keys (Gemini/OpenRouter/Claude/ChatGPT, this browser only) in
  the Account modal; optional cloud + self-hosted opencode turns. Key-missing
  states show inline hints, never dead buttons. AI never blocks coding.
- **Project kind:** `index.html` = web, else `main.py`/`app.py` = Python,
  else `main.go`/`go.mod` = Go (`adapters/filemap.ts`).
- **Checks honesty:** rows are run records (label, exit code, duration, output
  excerpt) — never framework assertions. Assertion diffs render only when a
  real `expected`/`actual` exists.

## Voice

- Friendly + plain: "Click Run to see your page here.", "No output yet."
- Errors say what + where: `Build error (line x:y)` with a clickable jump.
- Programs without a runner say what to do: "Python/Go need the remote runner (set VITE_BROKER_URL to your broker)."
- Quota says plain words: "Run time used up for today — try again tomorrow or ask for a higher quota." Never `402`, `Small-hours`, `allowance`.
- Infra words (`VITE_*`, Cells, externalId, session ids, callback URLs, meter logs) never surface in UI.

## Non-goals

- No color-only signalling (dots + labels), no hover-only controls on touch,
  no `window.confirm/prompt/alert` anywhere — destructive flows announce and
  stay recoverable via History snapshots.
- No new eager animation/icon weight: wallpapers + esbuild-wasm are the heavy
  assets and are precached by the PWA; modals share the one backdrop pattern.
