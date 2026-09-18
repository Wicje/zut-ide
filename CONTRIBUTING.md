# Contributing to zut

## 15-second start

```bash
npm install
npm run dev        # frontend → http://localhost:5173
npm run cloud      # backend (builds + agent) → http://localhost:8787
```

`npm run dev:all` runs both. The app works with zero config (local-only mode);
add Supabase env (see `.env.example`) for accounts, cloud save, and sharing.

## Which era is this file from?

The repo has three generations — know which one you're touching:

1. **Browser-only** (`src/lib/runner.ts`, esbuild-wasm): still the web fallback. Keep it working.
2. **Supabase Edge Functions** (`supabase/functions/*`): OAuth, GitHub/Vercel deploy, Claude proxy.
3. **zut-cloud / runtime** (`cloud/server.mjs`, `runtime/server.mjs`): remote `/build` + `/run` + headless agent. This is the future; prefer it.

Don't add a fourth way to do the same thing. New languages go through
`src/lib/projectKind.ts` (detect) + `POST /run` (execute) + `RunOutput.tsx`
(render) — not a new runner.

## Contracts (CI enforces some of these)

- Read `DESIGN.md` before touching UI. Tokens, one accent per meaning, mobile degrades for every desktop action.
- `import { cn } from '@/lib/utils'` — never from the `cn` package.
- Interactive primitives (`Button`, `Input`, `Badge`, `Textarea`) must `forwardRef`.
  React 18 drops refs on plain function components, which silently breaks every
  Radix `asChild` trigger (menus render stuck off-screen, no error).
- Destructive actions checkpoint first (`saveWorkspaceCheckpoint`) and announce
  to the console. No silent wipes.
- Programs (Python/Go) never execute on-device: route through `/run` with
  timeout + output caps. Keep `ZUT_RUN_TIMEOUT_MS` / `ZUT_RUN_MAX_OUTPUT` bounded.
- `VITE_*` vars are baked into the frontend bundle at build time — never put
  secrets in them. Server secrets live in `cloud/cloud.env` (gitignored).

## PR checklist

- `npm run typecheck`, `npm run test`, `npm run build` green.
- `node --check cloud/server.mjs` and `node --check runtime/server.mjs` if you touched the backend.
- Browser click-through of what you changed (desktop + 390px mobile + one program run).
- CHANGELOG.md entry under `[Unreleased]`.
