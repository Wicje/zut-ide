# zut-broker

Thin run broker in front of Mudbase BaaS + Cells. The browser sends only the
user's token + workspace id; service keys stay here.

```bash
# local demo (no keys, runs Python/Go in temp dirs)
ZUT_BROKER_DEV_ALLOW_ANON=1 npm run broker  # → http://127.0.0.1:8787
```

Point the IDE at it: `VITE_RUNTIME_URL=http://127.0.0.1:8787`.

## Env

| Var | Default | Notes |
|---|---|---|
| `PORT` / `ZUT_BROKER_PORT` | 8787 | |
| `DATA_ROOT` | `./broker-data` | demo BaaS store (Mudbase collections replace this) |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | — | user-token verify (60s cache); else `ZUT_BROKER_DEV_ALLOW_ANON=1` for demo |
| `CELLS_API_KEY` | — | absent = local demo runs; set = live Cells path |
| `CELLS_BASE_URL` | `https://api.mudbase.dev` | |
| `CELLS_DEFAULT_SIZE` | `micro` | smallest that works; opt into larger per workload |
| `CELLS_AUTOSUSPEND_MIN` | `5` | suspend on idle; suspended = no run time |
| `CELLS_TIMEOUT_MS` | `8000` | exec cap |
| `CELLS_MAX_OUTPUT` | `262144` | stdout+stderr cap |
| `CELLS_ENDPOINT_*` | see `cells.mjs` | per-path overrides — no code change to fix a 404 |
| `ZUT_DAILY_RUN_CAP` | `50` | payer decides |
| `ZUT_RATE_RUN_MIN` | `20` | |

## Smoke (demo, no keys)

```bash
ZUT_BROKER_DEV_ALLOW_ANON=1 PORT=8787 npm run broker &
T=demo-token
curl -s localhost:8787/health
curl -s -X POST localhost:8787/api/baas/projects \
  -H "Authorization: Bearer $T" -H 'Content-Type: application/json' \
  -d '{"name":"demo","files":{"main.py":"print(\"hello from broker\")"}}'
# → {"id":"..."} ; use it below as ID
curl -s -X POST localhost:8787/api/broker/run \
  -H "Authorization: Bearer $T" -H 'Content-Type: application/json' \
  -d '{"workspaceId":"default","files":{"main.py":"print(\"hello from broker\")"},"entry":"main.py"}'
# → {"stdout":"hello from broker\n","stderr":"","exitCode":0,...}
```

## Deploy

Frontend (static, free): build with your backend URLs, upload `dist/`
to Cloudflare Pages / Vercel / Netlify, set the custom domain as `CORS_ORIGIN`
below. Users then Install it from the browser menu (PWA).

```bash
VITE_SUPABASE_URL=https://YOUR_REF.supabase.co \
VITE_SUPABASE_ANON_KEY=eyJ... \
VITE_RUNTIME_URL=https://broker.yourdomain.com \
npm run build
```

Broker — option A, Render (days, no VPS): Web Service from `broker/Dockerfile`,
health check `/health`, Starter 2GB (free 512MB will OOM on go builds).
Set env: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `CORS_ORIGIN` (your exact
frontend host — REQUIRED, not optional: the `*` default is local-demo only),
plus `CELLS_API_KEY` when going live. Disk is ephemeral unless you pay for
one — fine while BaaS is the source of truth.

Broker — option B, VPS (proper): same shape as `cloud/DEPLOY.md` —
Ubuntu 24.04, Docker, `docker build -f broker/Dockerfile -t zut-broker .`,
run with `--env-file broker.env -v zut-broker-data:/data -p 127.0.0.1:8787:8787`
behind Caddy with auto-TLS. Copy `cloud/cloud.env.example` keys plus the
`CELLS_*` / `ZUT_DAILY_RUN_CAP` rows into `broker.env` (never commit it).

## Going live (first real Cell)

1. Set `CELLS_API_KEY` (+ `SUPABASE_URL/ANON_KEY`, unset dev-anon).
2. `POST /api/broker/run` with `{files: {main.py: "print(1)"}, entry: "main.py"}`.
3. If a step 404s/400s, fix it with the matching `CELLS_ENDPOINT_*` override —
   every assumption is in `cells.mjs` (marked VERIFY), nowhere else.
4. Confirm in logs: `cell=<id> reused=false sync=+1`, then `reused=true sync=+0`.
5. Confirm quota: run past `ZUT_DAILY_RUN_CAP` → `402` with plain words.
6. Then: terminal token → gateway WS; preview → expose URL; usage endpoint for exact billing.
