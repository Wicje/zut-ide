# DESIGN.md — zut IDE

> Living style contract for humans + AI agents. Change the UI only in ways
> that keep every section below true. (Format borrowed from designmd.supply:
> tokens first, components second, voice last.)

## Brand

- **Name:** zut, always lowercase. Mark: `~zut` — emerald `~` + neutral wordmark,
  mono, bold, tight tracking (`Toolbar.tsx`).
- **Positioning:** "Code with AI, from any device." A cloud IDE for phones and
  Chromebooks, not a desktop replacement.
- **Personality:** quiet workshop, not neon arcade. The UI recedes; the user's
  code and preview own the pixels.

## Palette (dark-first)

App boots `.dark`. Light tokens exist in `index.css` but there is no toggle —
do not design light-only states.

| Token | Value | Use |
|---|---|---|
| `background` | `oklch(0.145 0 0)` | app shell, panels |
| `muted` | panels at `/30`–`/40` opacity | explorer, panel headers, status bar |
| `border` | `border-border/60` for dividers | never full-contrast lines |
| `emerald-400/500/600` | **the** accent | Run, success, active file edge, active mobile tab, logo `~` |
| `red-400 / destructive` | errors only | build failure, error count, delete hover |
| `amber-400` | warnings + transient | unsaved dot, building state, key-missing dots |
| `violet-400/500` | AI only | AI buttons, proposal cards |
| `sky-400` | navigation | clickable file links in console |
| Console levels | `log #e6edf3 · info #79c0ff · warn #f0b429 · error #ff7b72 · debug #8b949e` | always paired with a dot + text label, never color alone |

One accent per meaning. Emerald = go/success, red = broken, amber = wait,
violet = AI. Do not add new accent hues without updating this table.

## Typography

- **UI:** `Geist Variable` (`--font-sans`). Panel headers: `text-xs font-medium uppercase tracking-wider text-muted-foreground`.
- **Code/paths:** monospace for file names, counts, status values, console.
- **Editor:** Monaco `vs-dark`, 14px, minimap off, word wrap on.

## Shape & elevation (Linear-quiet)

- Radius: `rounded-md` rows/chips, `rounded-lg` menus, `rounded-xl` proposal cards.
- Panel headers `h-9/10`, toolbar `h-12`, status bar `h-7` — headers whisper (`uppercase text-xs muted`), content speaks.
- Menus: `bg-popover ring-1 ring-foreground/10 shadow-md`, items `cursor-pointer`.
- Active file: accent wash + 2px emerald edge bar (not just bold text).

## Layout grammar (VS Code-like)

```
┌──────────────────────────────────────────────┐
│ titlebar: ~zut · name · saved · New… Run Save │
│ amber banner (only when cloud unconfigured)  │
├──────────┬───────────────────┬───────────────┤
│ explorer │ editor            │ preview       │
│ 248px    │ minmax flexible   │ 42% + console │
├──────────┴───────────────────┴───────────────┤
│ status: run-state · project · files · errors │
└──────────────────────────────────────────────┘
```

- Desktop grid: explorer / editor / preview+console. Columns are fixed today;
  do not widen chrome at the editor's expense.
- Mobile (`≤860px`): single pane + 4-tab dock (Code / Result / Files / AI),
  file strip on top, `env(safe-area-inset-bottom)` respected.
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
  status pill (`Not run yet / Building… / Running / Build failed`).
- **AI:** violet spark; backend tabs show key-missing amber dots and
  server-status dots. Cloud agent edits apply with a counted receipt
  ("applied N file changes").

## Voice

- Friendly + plain: "Click Run to see your page here.", "No output yet."
- Errors say what + where: `Build error (line x:y)` with a clickable jump.
- Infra words (`VITE_*`, callback URLs, meter logs) never surface to students.

## Non-goals

- No new toolbar buttons without a home in mobile (every desktop action must
  degrade: hide with reason, or live in the dock/dialogs).
- No color-only signalling (dots + labels), no hover-only controls on touch,
  no `window.confirm/prompt` for new flows (legacy debt, do not extend).
