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
every pane and modal — each renders `isDark` ternaries. No Tailwind dark-mode
config, no CSS variables file; tokens are inline.

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

One accent per meaning. Emerald = go/success, amber = wait,
red = primary action (and error states). Do not add new accent hues without updating this table.

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
- Pane headers `h-10 px-3.5 border-b`; resizers `w-1 cursor-col-resize`
  (hover `red-500/50`, active `red-600`, double-click resets 210 / 380).
- Modals: `fixed inset-0 z-50` backdrop `bg-black/50 backdrop-blur-xs`,
  `max-w-md` (simple) / `max-w-lg` / `max-w-2xl max-h-[85vh]` (PR studio).
- Scrollbars: 6px, `rgba(0,0,0,0.15)` thumb, transparent track.

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
- Right: Diff = SCM header + per-file accept/revert + PR/deploy actions;
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
- **Save model:** autosave to device draft (localStorage); cloud project when
  signed in. Editor status bar names it (`Saved · cloud/device`). ZIP only on
  explicit click; History snapshots are the safety net.
- **Deploy:** Vercel flow modal (build logs → live URL → push-to-GitHub),
  Netlify one-click (`deployStatic`), GitHub push modal (token, private toggle).
- **Palette:** `Cmd/Ctrl+K` fuzzy commands (sessions, theme, panes, terminal,
  PR, deploy, account, history, share, import). Pointer cursor, muted icons.
- **Console:** preview drawer streams console/errors; terminal drawer has
  benchmarks / terminal / logs tabs. Level = dot + label + message.
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
- Programs without a runner say what to do: "Python/Go need the remote runner (set VITE_RUNTIME_URL to your broker)."
- Quota says plain words: "Run time used up for today — try again tomorrow or ask for a higher quota." Never `402`, `Small-hours`, `allowance`.
- Infra words (`VITE_*`, Cells, externalId, session ids, callback URLs, meter logs) never surface in UI.

## Non-goals

- No color-only signalling (dots + labels), no hover-only controls on touch,
  no `window.confirm/prompt/alert` anywhere — destructive flows announce and
  stay recoverable via History snapshots.
- No new eager animation/icon weight: wallpapers + esbuild-wasm are the heavy
  assets and are precached by the PWA; modals share the one backdrop pattern.
