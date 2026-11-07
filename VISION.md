# Zut — The Universal Agentic IDE

> **The architectural manifesto:** How Zut bridges low-spec machines, self-hosters, mobile companions, and enterprise engineering teams into one unified, low-latency development fabric.

---

## 1. The Core Thesis

**Professional software development should not be gated by local hardware, installation hurdles, or device form factors.**

Traditional development forces a brutal compromise:
- **Desktop IDEs (VS Code, Cursor)** provide power and keyboard flow, but require high-spec laptops, complex environment setup, and lock execution to local silicon.
- **AI Web Builders (Bolt, Lovable)** offer zero-install creation, but produce black-box toys with no true IDE, no line-by-line code ownership, and severe vendor lock-in.
- **Cloud Workspaces (Codespaces, Replit)** offload compute, but are often clunky, sluggish, and expensive to idle.

**Zut’s breakthrough:** Decouple the **editing intelligence and interface** from the **execution compute**. 
By unifying an adaptive compute runner (Localhost ↔ Private Server ↔ Cloud MicroVM), a Cursor-grade semantic context engine (Merkle tree + AST + LSP), and an ergonomic inline editing flow, Zut delivers desktop-grade development across M4 MacBooks, 4GB laptops, and smartphones.

---

## 2. Who Zut Is For: The Unified Spectrum

Zut serves four distinct personas through adaptive modalities without fragmenting into separate products:

```
┌────────────────────────────────────────────────────────────────────────┐
│                              ZUT CLIENT                                │
├──────────────────────────┬──────────────────────────┬──────────────────┤
│   Desktop Power Devs     │   Non-Engineers / PMs    │  Phone Companion │
│   • Keyboard-first flow  │   • Agent composer       │  • Voice / Chat  │
│   • In-buffer Cmd+K diff │   • Live app preview     │  • Tap review    │
│   • Full terminal & LSP  │   • 1-click Vercel push  │  • Hotfix & CI   │
└────────────┬─────────────┴────────────┬─────────────┴─────────┬────────┘
             │                          │                       │
             ▼                          ▼                       ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        ZUT ADAPTIVE ENGINE                             │
│   Merkle Tree Sync  •  AST + Vector Index  •  Remote LSP Proxy Protocol │
└──────────────────────────────────────┬─────────────────────────────────┘
                                       │
     ┌─────────────────────────────────┼──────────────────────────────┐
     ▼                                 ▼                              ▼
Localhost Engine               Self-Hosted Daemon               Zut Cloud Compute
(M-Series / Linux / PC)     (Home Lab / Team Server)       (Firecracker MicroVMs)
```

### 1. Professional Engineers & Teams
* **Need:** Sub-100ms editor latency, complete git branching, real language servers (`rust-analyzer`, `gopls`, `tsserver`), and full control over every diff.
* **Experience:** In-buffer `Cmd+K` inline editing, ghost-text tab autocomplete, integrated terminal PTY, and collaborative review rooms.

### 2. Low-Spec Laptops & Students (4GB RAM, Chromebooks)
* **Need:** The ability to build modern, memory-heavy frameworks (Next.js, Vite, Docker, Rust) without thermal throttling or out-of-memory crashes.
* **Experience:** The lightweight web shell renders Monaco locally at 60fps; compilation, bundling, and tests execute entirely on cloud or remote hosts.

### 3. Self-Hosters & Privacy-First Enterprises
* **Need:** Zero telemetry, complete code custody, and air-gapped or internal LLM routing (Ollama, vLLM, OpenCode).
* **Experience:** Single binary (`zut host`) running on personal hardware, local clusters, or VPCs. API keys and data never transit third-party clouds.

### 4. Non-Engineers & Builders
* **Need:** Natural language to live application with zero setup friction.
* **Experience:** High-level Composer, interactive live preview with responsive breakpoints, visual feedback inspector, and instant deployment.

### 5. Mobile & On-the-Go Developers
* **Need:** Unlocking the phone as an active software creation tool without trying to emulate a 27-inch monitor.
* **Experience:** Designed for **Voice-to-Agent instructions**, **one-tap diff reviews**, **live build monitoring**, and **emergency hotfixes**.

---

## 3. The Dual-Engine Compute Architecture: Localhost ↔ Cloud

Zut operates on an **Adaptive Compute Protocol**. The client does not care where the code executes:

| Mode | Where Compute Runs | Best For | Cost & Network |
| :--- | :--- | :--- | :--- |
| **Localhost Mode** | User's local machine via `zut host` daemon | Devs with high-spec machines; offline work | $0 cloud cost; instant file I/O |
| **Cloud Runner Mode** | Ephemeral Zut MicroVMs (Firecracker / Docker) | 4GB laptops, Chromebooks, non-engineers | On-demand billing; zero local install |
| **Self-Hosted Remote** | Private VPS, home lab, or team cluster | Self-hosters, teams, regulated data | Self-managed; access via WireGuard/Tailscale |

The IDE transitions transparently between these engines. A project started on an office workstation can be inspected and run from a phone via the cloud proxy, syncing state in real time.

---

## 4. The Cursor-Class Context & Intelligence System

Frontier coding agents fail when they lack repository context. Zut implements a deep 4-layer context engine:

```
[Merklized File Tree] ──> Fast incremental delta sync across client & runner
         │
[Tree-Sitter AST]     ──> Syntactic structure (functions, classes, call graphs)
         │
[Hybrid Vector Index] ──> Semantic similarity & intent retrieval
         │
[Remote LSP Engine]   ──> Type accuracy, go-to-definition, and diagnostics
```

1. **Merkle Tree Incremental Sync:**
   The workspace maintains an in-memory Merkle tree. Only mutated byte ranges are transmitted between the browser, cloud runner, and self-hosted host, ensuring ultra-fast synchronization even over mobile connections.
2. **AST Parsing via Tree-Sitter:**
   Codebases are decomposed into precise syntactic trees, enabling the agent to target exact symbol boundaries rather than blunt line chunks.
3. **Hybrid Embeddings & Symbol Retrieval:**
   Combines dense semantic embeddings with sparse keyword search (BM25/ripgrep) to surface relevant reference files, configuration schemas, and utility functions in multi-thousand-file repositories.
4. **Remote Language Server Protocol (LSP) Proxy:**
   Real LSPs run on the compute runner (`tsserver`, `pyright`, `gopls`). Diagnostic red squiggles, type signatures, and hover cards stream into the browser Monaco editor over lightweight WebSockets.

---

## 5. Editing Ergonomics: In-Buffer Flow & Sub-100ms Speed

### 1. In-Buffer Inline Diffing (`Cmd+K`)
* Deprecates cumbersome separate review panes for routine modifications.
* Code suggestions stream directly into the active editor buffer using inline line decorations (green additions, red removals).
* Accept with `Tab` or `Cmd+Enter`; reject with `Esc`. Review happens in flow.

### 2. Zut Tab (High-Velocity Speculative Autocomplete)
* Specialized, fine-tuned lightweight models (3B–7B parameters) deployed on high-throughput inference endpoints.
* Sub-100ms time-to-first-token.
* Predictive cursor positioning and multi-line ghost completions based on active file history.

### 3. Frontier Model Routing
* **Fast Tier:** Low-latency speculative models for completions and inline refactors.
* **Deep Reasoning Tier:** Claude 3.7 Sonnet, OpenAI o3-mini, and Gemini 2.0 Flash for multi-file architectural planning and complex debugging.
* **BYO-Key & Local Tier:** Full support for OpenRouter, Ollama, and local vLLM instances for complete cost and privacy control.

---

## 6. The Mobile Companion Strategy

We do not force developers to type code on touchscreens. The phone experience is designed around the gestures and workflows that actually work on mobile:

1. **Voice-to-Agent Dispatch:** Speak natural language tasks while away from your desk (*"Fix the mobile drawer navigation z-index and run tests"*). The remote runner builds and verifies the patch.
2. **Swipe-to-Approve Diff Review:** Review multi-file pull requests and agent changes with Tinder-style or side-by-side swipe gestures (Swipe right to accept, swipe left to reject).
3. **Live Sandbox Preview:** Interact directly with responsive web apps, test touch gestures natively, and view real-time runtime console logs.
4. **Emergency Hotfixes:** One-tap rollbacks, automated CI check triggers, and Vercel/GitHub production redeployments.

---

## 7. How We Know We Won

1. **The Pro Engineer Test:** An engineer on an M-series Mac uses Zut with `localhost` compute for daily work because the inline agent and indexing are faster and cleaner than their current setup.
2. **The 4GB Laptop / Student Test:** A student on a low-end Chromebook or second-hand laptop opens Zut, writes full-stack TypeScript, builds a Next.js app on Zut Compute without spinning a fan, and deploys to production in 60 seconds.
3. **The Phone Companion Test:** A lead developer riding transit receives an alert, speaks a bug fix prompt into the Zut phone app, reviews the agent's inline diff with three taps, passes CI, and merges the PR before reaching their stop.
4. **The Self-Host / Enterprise Test:** An enterprise runs `zut host` on their private VPC, connecting their team with zero telemetry, using on-prem models with full LSP type-safety.

---

## 8. What Is Built vs What Is Not

This manifesto is the target. The shipped product is parts of it. We write the gap plainly so the roadmap, the landing copy, and the code stay honest with each other.

### Built now

- **Adaptive compute split is real, not just philosophy.** The IDE talks to local opencode, a self-hosted `zut host` workspace, the broker (runs/terminal/preview), and the cloud agent server through one client. The UI says Run / Terminal / Preview; the backend is not named in the product.
- **Bring-your-own-agent is the default posture.** The model picker lists whatever the connected agent serves; BYOK chat transports (OpenRouter, Anthropic, ChatGPT, Gemini) talk straight from the browser to the provider; self-hosted opencode is the free-first default when it is up. Zut is a client of the agent.
- **Accounts are the door.** Supabase or Mudbase; email+password plus OAuth where configured; the landing can hand a session into the IDE. Local dev and `?nowait` still walk straight in.
- **Editor + preview + review are real.** Monaco, file tabs, breadcrumbs, inline prompt, ghost-text completion toggle, breakpoints; esbuild-wasm in-browser web bundling with a cloud build fallback; sandboxed preview iframe with console drawer; per-file accept/revert diffs with checkpoints.
- **Safety is a first-class behavior, not a feature flag.** New / Import / Restore / revert / rollback all snapshot first; local draft, snapshots, sessions, rules, and usage are persisted locally; secrets are redacted before render; the host token is documented as a shared secret, not a user identity; `VITE_*` values are called out as public bundle content.
- **Mobile and terminal are real paths, with budgets.** The phone layout is a real single-pane four-tab adaptation with safe-area, 16px controls, and >=40px targets; `zut-term` paints the same app over kitty graphics with a capped frame budget and drops wallpaper/blur/animations/caret blink under `?terminal=1`.
- **The style system is a contract.** One accent per meaning, four type sizes, three surfaces, a theme mechanism keyed off `[data-theme]`, and an explicit rule that infra words do not leak into the UI.

### Not built yet

- **Zut Compute is the headline feature that is not online yet.** `hostedAgentAvailable()` is false until the VPS is up and `VITE_OPENCODE_URL` points at it. The hosted agent card says "Coming soon" on purpose.
- **The Cursor-class context engine in Section 4 is a spec, not shipped code.** Merkle tree incremental sync, Tree-Sitter AST decomposition, hybrid embedding + keyword retrieval, and a remote LSP proxy are described here as the future intelligence layer. The current agent context is file list + active file + rules + connectors, not a synced merkle index or an ast-aware symbol graph.
- **Sub-100ms Tab completion is a target, not a live latency.** Ghost-text completion exists and is wired to the provider the user already has a key for; the low-latency specialized-model autocomplete described here is future work.
- **Mobile as an active companion is partial.** Voice input and the mobile shell exist; swipe-to-approve review, tap-only multi-file review, and the "transit hotfix" flow in Section 6 are future product, not current behavior.
- **Self-host first-run card is built.** After the agent-home step on any surface the IDE now shows the self-host first-run card (`showSelfHostCard` in `src/App.tsx`) with the copy-paste host command, connected/disconnected status, and a Connect host action that opens `HostModal`. The card exists; the hosted-agent path behind it is still the "Coming soon" gate from Section 8's first bullet.
- **Pricing / quota for hosted turns is not wired.** Runs are metered server-side, but hosted usage is not yet tied to the signed-in account's quota/pricing in the way the landing copy implies. Before Zut Compute goes public, that gap has to close.

### The honest line

The product today is: **a real IDE shell that keeps the editing workflow local and moves the heavy compute off-device, with a self-hosted agent as the working default and a hosted agent coming later.** The Cursor-grade context engine and the sub-100ms Tab are what we are building toward, not what a new user gets on day one.

---

## 9. What We Are Fixing Next

This is the work behind the current critique, in priority order.

### 1. Make the hosted-agent launch a real product gate, not a docs flip

The biggest risk in the current repo is that the public story implies a billing/quota relationship the backend does not yet enforce. Before Zut Compute goes public:

- Get the VPS up and point `VITE_OPENCODE_URL` at it — **blocked on ops / no VPS access yet**. Until then `hostedAgentAvailable()` is false and the AgentSetup "On our server" card reads "Coming soon". This is the single real blocker for this item; nothing else here is useful until the server exists.
- Wire hosted usage to the signed-in account (token → quota row), not to anon runs. The usage meter that exists today is local-only — **not done**. The IDE's agent-turn meter is still a local count (`agentUseThisMonth()`); the broker only caps code runs per uid, not agent turns. The honest fix landed: the meter is now labelled "Agent turns (this device)" with a local count, and the runs line says when the broker caps runs server-side vs local. Full wiring needs the VPS + a broker endpoint that counts agent turns per signed-in user.
- Decide what a free account gets and put the real numbers in the pricing copy and in the in-app quota line — **done**. Pilot = 50 agent turns a month, resets on the 1st, in the pricing card + FAQ + footer (landing/index.html); the in-app meter shows the local count with a clear "local" label and monthly reset date.
- Treat the FAQ sentence and the AgentSetup card as launch copy that must change on the same day the server flips — **done**. The AgentSetup card auto-flips via `hostedAgentAvailable()`; the FAQ + pricing copy is marked with an HTML comment as launch-gated and must be flipped same-day with the AgentSetup card when `VITE_OPENCODE_URL` is set.

### 2. Close the account loose ends before real users arrive

- Add a "forgot password" path — **done**. Added a "Forgot password?" link under the sign-in form in AuthPage.tsx (full-screen sign-in page) and a "Forgot password? Send a reset link" link in the account modal's sign-in tab; both call `sb.auth.resetPasswordForEmail(email, { redirectTo: origin })` through `handleResetPassword` in App.tsx. Mudbase already exposed `mudResetPassword` in the modal's Reset tab; the gap was the Supabase side in AuthPage. The link is hidden on localhost (item 2c), so it only appears once a real Supabase project is wired.
- Fix the OAuth → agent-setup handoff — **done (code; not verifiable in dev)**. Added `wasSigningInRef` (App.tsx) + an `onSignInStart` prop on AuthPage + a check inside `onAuthStateChange` so a fresh sign-in — magic link, OAuth, or sign-up whose confirmation mail lands a session — sets `needsAgentSetup(true)` when `getAgentMode()` is null. Magic-link sign-in no longer skips the "where should the agent run" step. Verifies on a real Supabase account; blocked in dev because `VITE_OPENCODE_URL` / `VITE_SUPABASE_URL` are unset and the Supabase path is gated on localhost (item 2c).
- Gate the Supabase fallback so dev signups do not keep landing in the shared project with real confirmation emails — **done**. `accountProvider()` (src/lib/account.ts) returns `'supabase'` only when `authConfigured() && !isLocalhost()`, so `npm run dev` signups stay env-only; the AuthPage shows a "not configured" notice and disables submit when no backend is wired (`accounts` false).
- Treat the landing's `sb-<ref>-auth-token` session handoff as a compatibility detail — **done (documented; e2e not written)**. The landing writes the session under `sb-<project-ref>-auth-token` by hand; supabase-js v2 reads sessions from that same key, so the landing → IDE handoff works by construction (TODO item 9). Worth an e2e test that survives SDK upgrades (TODO item 18); not fatal if skipped.

### 3. Finish the first-run story on real devices

- Give self-host mode a real first-run card after "On your machine" — copy-paste commands, what to run, what "connected" looks like — not just a toast.
- Run the gate, auth page, and agent-home cards on a real phone. They were designed at desktop width; the product's point is phones and 4GB laptops.
- Replace the landing hero shot with a screenshot of the current shell (title bar + mark + new chrome), not the old pill.
    -> Done (2026-11-06): `landing/images/shot-app.jpg` is now a real shot of
    the current shell, and `landing/images/shot-agent.jpg` is now a real
    composer shot. The other feature-section shots (shot-diff / shot-preview /
    shot-ship) are still the old set — the feature-shot automation lands the
    agent turn inconsistently and catches the right pane mid-turn, so those
    three still need a reliable agent turn or a manual re-shot.

### 4. Decide the mobile truth and stop overselling the future

The mobile shell and voice input are real. Swipe-to-approve review and the "transit hotfix" story are not. If the near-term phone product is "open the IDE on a phone and review diffs," say that plainly in the roadmap and keep the swipe/tap review section where it belongs: future work, not the current promise.

### 5. Hold the design contract against the density we actually shipped

- Keep one accent per meaning. Red is the primary action and the error color; that is a real tension in an IDE whose main button is "Run," so it has to stay deliberate, not drift.
- Round the small sizes to the scale. `10.5 / 11.5 / 12.5` and body at `12.5` are the recurring drift; the contract says body is 13 and the small sizes round to the nearest step.
- Even out empty-state and placeholder voice. The quiet tone is mostly there; the gaps are the first place the app stops feeling like one product.
- Watch the cumulative chrome. The shell is now dense in a good way, but density is where first-time users go to understand nothing. The classroom walk-through is the right test for whether the density is earned.

### 6. Clean up the engineering hygiene that makes this look like a fork

- One localStorage namespace — done (commit `61c9d2a`). Every persisted browser value now lives under the `zut:*` namespace via a single `K` object in `src/lib/storage-keys.ts`. A `migrateStorage()` call in `main.tsx` copies any legacy `gpide:*` value into its `zut:*` counterpart once and drops the legacy key; all readers use `readKey`/`writeKey`/`removeKey` helpers with an in-memory fallback, so the first load is safe before migration has run and the code also works in private mode and in Node test runners without `localStorage`. Legacy `gpide:*` keys remain only inside the migration map (the single documented legacy-key source) and in transition comments.
- Stop leaking legacy internal names — done (commit `61c9d2a`). No `chisom_ide` or `gpide` artifacts remain as active storage contracts, key literals, or code comments. The `src/types.ts` backend-contract comment and the `src/lib/secrets.ts` hygiene comment were rewritten. The only `gpide:` strings left are the migration map in `src/lib/storage-keys.ts` and brief transition comments there and in `secrets.ts`.
- Focused coverage where data corruption would be invisible — not started. Add tests around broker/adapter contracts, the diff/build path, and the account→agent-home handoff. The current unit tests are fine for where the repo is; the next layer is the layers that silently lose user data. The storage layer is now one module (`src/lib/storage-keys.ts`) with migration + helpers, which is easier to cover than the per-module `store()` fallbacks it replaced.

### 7. Keep the self-host story simple

BYOK + self-hosted opencode + host workspace + broker + cloud is a lot of ways to run the same IDE. The product is better for having all of them. The onramp has to stay dead simple, because the options will confuse a first-time user fast. One Primary path per surface, and the first-run card is where that discipline gets tested.
