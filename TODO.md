# What's left

The account work (this round) is done: gate, signup, agent-home choice,
landing. This file is the honest backlog behind it.

## Zut Compute — the product's headline, not online yet

1. **Get the VPS.** Everything below keys off one env var:
   `VITE_OPENCODE_URL` pointed at the public opencode server. Until then
   `hostedAgentAvailable()` (src/lib/account.ts) returns false and the
   AgentSetup card honestly says "Coming soon"; self-host is the default.
2. **Auth for hosted turns.** The broker already runs turns server-side
   (`POST /run`, `/agent/turn`, quota per day), but nothing ties a turn to
   the *account* paying for it. Before Zut Compute goes public, hosted
   usage must be metered against the Supabase user (token → quota row;
   `supabase/usage_meter.sql` exists — wire it to accounts, not anon runs).
3. **Pricing/quota copy.** "Editing is free, only runs use run time" holds;
   decide what a free account gets on Zut Compute (e.g. N build-minutes/day)
   and put the real numbers in the pricing section.
4. **Flip the card.** When the server is up: `hostedAgentAvailable()` flips
   by itself; also swap the FAQ sentence ("coming online" → real offer).

## Accounts — loose ends

5. ~~**Turn on email/password in the Supabase project** (Auth → Providers).~~
   Done via the Management API (2026-10-22): email provider on, signups on,
   **auto-confirm on** — an account created from the landing is usable
   immediately (no email round-trip on a phone). If deliverability abuse
   ever shows up, flip auto-confirm off and the Confirmed-email flow just works.
6. **Dev noise.** The fallback constants mean `npm run dev` signups land in
   the shared project with real confirmation emails. Eventually gate the
   fallback to production builds (import.meta.env.PROD) so dev stays env-only.
7. **Google/GitHub OAuth.** The buttons render only when Mudbase OAuth is
   configured. Decide if Supabase social providers should light them up too.
8. **Password reset.** Mudbase has `mudResendVerification`/`mudResetPassword`
   helpers; the auth page has no "forgot password" UI yet. Add it (one link
   under the sign-in form) before real users arrive.
9. **The `-user` note.** The landing stores the session under
   `sb-<ref>-auth-token` manually. It matches the current supabase-js
   (verified against the installed version); if the SDK changes its storage
   shape, users may just get asked to sign in again — not fatal, but worth
   an e2e test that survives upgrades.

## The IDE's first-run story

10. **AgentSetup after OAuth.** Social sign-in callbacks skip AuthPage's
    onSignedIn path — check the Mudbase/OAuth flow also triggers the
    "where should the agent run" step (it should, via `user` state + a
    `getAgentMode()` check; verify on a real account).
11. **Connect hint in self-host mode.** After "On your machine" the IDE
    shows a toast about connecting opencode, and that's all. The host modal
    / `npm run dev:opencode` deserves a first-run card with copy-paste
    commands (see scripts/install-local-service.mjs for what exists).
12. **Mobile pass on the new screens.** The gate, auth page and agent-home
    cards were designed at desktop width; test on a real phone (the whole
    point of the product).
13. **Landing screenshots.** The hero still shows the old pill-shell shot;
    re-screenshot the real IDE (title bar with the mark, new chrome) and
    replace the images.

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
