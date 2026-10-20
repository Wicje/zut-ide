# Contributing to zut

## 15-second start

```bash
npm install
npm run dev        # frontend → http://localhost:5173
npm run cloud      # backend (builds + agent) → http://localhost:8787
```

`npm run dev:all` runs both. The app works with zero config (local-only mode);
add Supabase env (see `.env.example`) for accounts, cloud save, and sharing.

## Where things live

Three runtimes share one UI — know which one you're touching:

1. **Browser** (`src/`): the React/Monaco shell. Web previews bundle locally
   with esbuild-wasm (`src/adapters/preview.ts`); local folders use File System
   Access (`src/adapters/localRepo.ts`); GitHub push/import are direct fetch
   calls (`src/adapters/github.ts`, `githubRepo.ts`).
2. **Supabase** (`supabase/`): accounts, cloud save, shares, and the
   `vercel-deploy` Edge Function. The other functions are legacy and unused.
3. **Host services** (`host/`, `broker/`, `cloud/`, `runtime/`): `npm run host`
   owns a real workspace (files/git/pty/debugger); broker/cloud/runtime handle
   Python/Go runs, remote previews, and agent turns.

Don't add another way to do the same thing. Languages are detected in
`src/adapters/filemap.ts`; Python/Go execute only through the broker or runtime,
never in the browser.

## Contracts (CI enforces some of these)

- Read `DESIGN.md` before touching UI. Tokens, one accent per meaning, mobile degrades for every desktop action.
- `import { cn } from '@/lib/utils'` — never from the `cn` package.
- Interactive primitives (`Button`, `Input`, `Badge`, `Textarea`) must `forwardRef`.
  React 18 drops refs on plain function components, which silently breaks every
  Radix `asChild` trigger (menus render stuck off-screen, no error).
- Destructive actions checkpoint first (`takeSnapshot`) and announce to the
  console. No silent wipes.
- `.env*` files never enter drafts, local/host sync, repo import, or AI context.
- Programs (Python/Go) never execute on-device: route through `/run` with
  timeout + output caps. Keep `ZUT_RUN_TIMEOUT_MS` / `ZUT_RUN_MAX_OUTPUT` bounded.
- `VITE_*` vars are baked into the frontend bundle at build time — never put
  secrets in them. That includes `VITE_ZUT_HOST_TOKEN` on any exposed host.
  Server secrets live in `cloud/cloud.env` (gitignored).
- The host token is a shared secret, not a user identity.

## PR checklist

- `npm run typecheck`, `npm test`, `npm run build` green.
- `node --check` the backend files you touched (`cloud/`, `runtime/`, `broker/`,
  `host/*.mjs`). CI already checks `host/` syntax.
- Browser click-through of what you changed (desktop + 390px mobile + one program run).
- CHANGELOG.md entry under `[Unreleased]`.
