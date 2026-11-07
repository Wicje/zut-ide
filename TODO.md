# What's left

The account work (this round) is done: gate, signup, agent-home choice,
landing. This file is the honest backlog behind it.

## Zut Compute — the product's headline, not online yet

1. **Get the VPS — blocked on ops, no VPS access.** Everything below keys
   off one env var: `VITE_OPENCODE_URL` pointed at the public opencode
   server. Until then `hostedAgentAvailable()` (src/lib/account.ts) returns
   false and the AgentSetup card honestly says "Coming soon"; self-host is
   the default. This is the single real blocker for Section 9 item 1; the
   other sub-items are not useful until the server exists.
2. **Auth for hosted turns — not done (needs VPS + broker endpoint).** The
   broker already runs turns server-side (`POST /run`, `/agent/turn`, daily
   quota per uid), but nothing ties an *agent turn* to the account paying
   for it — only code runs are capped, per uid. The IDE's agent-turn meter
   is still a local count (`agentUseThisMonth()`); the honest local-label
   fix landed (meter now says "Agent turns (this device)", runs line says
   when the broker caps server-side). Full wiring needs the VPS up + a
   broker endpoint that counts agent turns per signed-in Supabase user
   (`supabase/usage_meter.sql` exists — wire it to accounts, not anon).
3. **Pricing/quota copy — done.** Pilot = 50 agent turns a month, resets
   on the 1st, in the pricing card + FAQ + footer
   (landing/index.html); the in-app meter shows the local count with a clear
   "local" label and monthly reset date. Real numbers are now in the copy.
4. **Flip the card — done (card auto-flips; FAQ marked launch-gated).**
   When the server is up: `hostedAgentAvailable()` flips the AgentSetup card
   by itself; the FAQ + pricing copy is marked with an HTML comment as
   launch-gated copy that must be flipped the same day with the card when
   `VITE_OPENCODE_URL` is set.

## Accounts — loose ends

5. ~~**Turn on email/password in the Supabase project** (Auth → Providers).~~
   Done via the Management API (2026-10-22): email provider on, signups on,
   **auto-confirm on** — an account created from the landing is usable
   immediately (no email round-trip on a phone). If deliverability abuse
   ever shows up, flip auto-confirm off and the Confirmed-email flow just works.
6. **Dev noise — done.** The hardcoded Supabase fallback would let `npm run dev`
   signups land in the shared project with real confirmation emails. `accountProvider()`
   (src/lib/account.ts) now returns `'supabase'` only when `authConfigured() && !isLocalhost()`,
   so dev signups stay env-only: `isLocalhost()` (browser-only: localhost / 127.0.0.1 /
   [::1]) gates the fallback, and the AuthPage shows a "not configured" notice and
   disables submit when no backend is wired (`accounts` false). Migration footguns
   (storage keys, legacy names) are a separate hygiene item (TODO 21/22).
7. **Google/GitHub OAuth.** The buttons render only when Mudbase OAuth is
   configured. Decide if Supabase social providers should light them up too.
8. **Password reset — done.** Added a "Forgot password?" link under the sign-in
   form in AuthPage.tsx (full-screen sign-in page) and a "Forgot password? Send
   a reset link" link in the account modal's sign-in tab; both call
   `sb.auth.resetPasswordForEmail(email, { redirectTo: origin })` via
   `handleResetPassword` in App.tsx. Mudbase already exposed
   `mudResetPassword`/`mudResendVerification` in the modal's Reset tab; the gap
   was the Supabase side in AuthPage. The link is hidden on localhost (item 6),
   so it only appears once a real Supabase project is wired.
9. **The `-user` note.** The landing stores the session under
   `sb-<ref>-auth-token` manually. It matches the current supabase-js
   (verified against the installed version); if the SDK changes its storage
   shape, users may just get asked to sign in again — not fatal, but worth
   an e2e test that survives upgrades.

## The IDE's first-run story

10. **AgentSetup after OAuth — done (code; not verifiable in dev).** Social
    sign-in callbacks skip AuthPage's onSignedIn path (OAuth returns before the
    redirect lands a session). Fixed by adding `wasSigningInRef` (App.tsx) + an
    `onSignInStart` prop on AuthPage + a check inside `onAuthStateChange` so a
    fresh sign-in — magic link, OAuth, or sign-up whose confirmation mail lands a
    session — sets `needsAgentSetup(true)` when `getAgentMode()` is null. The
    "where should the agent run" step now fires for magic-link sign-in too. Verifies
    on a real Supabase account; blocked in dev because `VITE_SUPABASE_URL` is unset
    and the Supabase path is gated on localhost (TODO item 6).
11. **Connect hint in self-host mode.** After "On your machine" the IDE
    shows a toast about connecting opencode, and that's all. The host modal
    / `npm run dev:opencode` deserves a first-run card with copy-paste
    commands (see scripts/install-local-service.mjs for what exists).
    -> Done (2026-11-06): `src/App.tsx` shows the self-host first-run card
    (`showSelfHostCard`) after the agent-home step on any surface, with the
    host command, connected/disconnected status, and a Connect host / Close
    action. `firstAgentShow` records that the step happened so the card does
    not re-trigger.
12. **Mobile pass on the new screens.** The gate, auth page and agent-home
    cards were designed at desktop width; test on a real phone (the whole
    point of the product).
13. **Landing screenshots.** The hero still shows the old pill-shell shot;
    re-screenshot the real IDE (title bar with the mark, new chrome) and
    replace the images.
    -> Done (2026-11-06): replaced `landing/images/shot-app.jpg` with a real
    screenshot of the current shell (dark title bar, Zut mark, sidebar with
    New project / Open folder / Import repo / Open host / Git / Commands /
    Customize, Guest unsigned-in, New agent composer with opencode
    self-host mode, Review / Code / Preview / Checks tabs). Shot via
    `scripts/ui-shots/shot-hero.mjs` against a static serve of `dist/`.
    -> Done (2026-11-06): replaced `landing/images/shot-agent.jpg` with a real
    composer-with-typed-prompt shot (`scripts/ui-shots/shot-features.mjs`).
    The other feature shots (shot-diff / shot-preview / shot-ship) are still
    the old ones: the feature-shot automation lands the agent turn
    inconsistently and catches the right pane mid-turn (blank), so those three
    still need a reliable agent turn or a manual re-shot pass.

## Validation loop (the classroom plan)

14. **A teacher's 10-minute path.** Write the doc: create account → New
    agent or hand-write → Run → Deploy. Then walk a bootcamp through it and
    watch where they stumble — that is the real backlog.
15. **Cheatsheet for students.** One page: what the panes do, diff review,
    plan mode, connectors (Supabase/GitHub/Vercel tokens).

## Post-launch hygiene

16. **`supabase/waitlist.sql`** can stay; the `waitlist` table is unused.
    Remove the Sendliberty references from docs once confirmed dead.
17. **Old localStorage flag** (`zut:waitlist-joined`) is harmless — ignore it.
18. **E2E for the door.** playwright: landing → create account → gate
    passes; wrong password shows the error; agent-home choice renders.

19. ~~**Terminal paint perf.**~~ Done (2026-11-06): `zut-term` now caps the
    frame budget (`--quality low|balanced|high`, `--fps`, `--max-pixels`),
    defaults to low inside tmux and on machines under 6 GB, and marks the
    URL with `?terminal=1` so the app drops wallpaper/blur/transitions and
    Monaco's blinking caret and smooth scrolling. The production preview
    (dist, port 4173) remains the default; `--dev` is opt-in.
20. **The door on other hosts.** Vercel serves the gate, but the hosted
    agent card is still "Coming soon"; until the VPS lands, the first
    signed-in user has no agent unless they self-host from the same box.

## Hygiene the critique asked for

21. **One localStorage namespace — DONE (d4185d9).** Every persisted browser
    value now lives under the `zut:*` namespace via a single `K` object in
    `src/lib/storage-keys.ts`. A `migrateStorage()` call in `main.tsx` copies
    any legacy `gpide:*` value into its `zut:*` counterpart once and drops the
    legacy key; all readers use `readKey`/`writeKey`/`removeKey` helpers with
    an in-memory fallback, so the first load is safe before migration has run
    and the code also works in private mode and in Node test runners without
    localStorage. Legacy `gpide:*` keys remain only inside the migration map
    (the documented legacy-key source) and in transition comments.
22. **Legacy internal names — DONE (d4185d9).** No `chisom_ide` or
    `gpide` artifacts remain as active storage contracts, key literals, or
    code comments. The `src/types.ts` backend-contract comment and the
    `src/lib/secrets.ts` hygiene comment were rewritten to drop the old
    names. The only `gpide:` strings left are the migration map in
    `src/lib/storage-keys.ts` (the single documented legacy-key source) and
    brief transition comments there and in `secrets.ts`.
23. **Coverage where data corruption would be invisible — next hygiene item
    (not started).** Add focused tests around broker/adapter contracts, the
    diff/build path, and the account → agent-home handoff. The current unit
    tests are fine for where the repo is; the next layer is the layers that
    silently lose user data. The storage layer is now one module
    (`src/lib/storage-keys.ts`) with migration + helpers, which is easier to
    cover than the per-module `store()` fallbacks it replaced.
