# Ship zut-cloud on your OneNetwork VPS (or Render for a few days)

You handle the VPS clicking, this repo handles everything else.
Target: `https://cloud.onenetwork.ng/dashboard` → one Ubuntu VPS → one `docker compose up`.

Short-term alternative: Render.com Web Service from `cloud/Dockerfile` (no Caddy —
Render terminates TLS). Use Starter 2GB for days, then suspend. Free 512MB will
OOM on esbuild + opencode. Set `CORS_ORIGIN` to your frontend, health check
`/health`, and use its URL as `VITE_RUNTIME_URL` / `VITE_CLOUD_URL`.
`PORT` already respects Render's injected `$PORT`. Disk is ephemeral unless you
pay for a Disk — fine for days because the browser FileMap is source of truth.

You handle the VPS clicking, this repo handles everything else.
Target: `https://cloud.onenetwork.ng/dashboard` → one Ubuntu VPS → one `docker compose up`.

## 0. What you get

- Frontend: static (Cloudflare Pages / Vercel / any host, free).
- VPS: `zut-cloud` (builds + AI agent) behind Caddy with auto-TLS.
- DB/Auth: your existing Supabase project (free tier is fine).
- LLM cost to you: ₦0 — users bring their own OpenRouter key (`sk-or-…`).
  Server just runs the agent tools.

## 1. Create the VPS (your part, ~10 min)

1. Log in at `https://cloud.onenetwork.ng/dashboard`.
2. Create VPS / Cloud Server:
   - Image: **Ubuntu 24.04 LTS**
   - Plan: smallest with **2 vCPU / 4 GB RAM / 40 GB+ SSD** (1 vCPU / 1–2 GB will OOM running esbuild + opencode).
   - Region: **Lagos / Nigeria** if listed (lowest latency for your users), else closest.
   - Add your SSH key. Note the public IPv4.
3. DNS: point an A record at that IP, e.g. `cloud.yourdomain.com`.
   (No domain yet? Use `http://<IP>` for testing — TLS comes after DNS.)
4. Open ports `80`, `443`, `22` in the panel firewall / security group.

## 2. First boot on the VPS (~15 min)

```bash
ssh root@<VPS_IP>
apt update && apt upgrade -y
apt install -y git curl ufw
ufw allow 22,80,443/tcp && ufw --enable

# Docker (official)
curl -fsSL https://get.docker.com | sh

git clone <your-zut-repo-url> zut && cd zut
cp cloud/cloud.env.example cloud/cloud.env
nano cloud/cloud.env   # fill SUPABASE_URL, SUPABASE_ANON_KEY, CLOUD_HOST, ACME_EMAIL, CORS_ORIGIN
```

Values:
- `SUPABASE_URL` / `SUPABASE_ANON_KEY` — same values already in your frontend `.env`.
- `CLOUD_HOST=cloud.yourdomain.com`
- `ACME_EMAIL=you@yourdomain.com`
- `CORS_ORIGIN=https://<your-frontend-host>` (your Pages/Vercel URL — REQUIRED, not
  optional: the `*` default lets any website on the internet spend your agent quota)

```bash
cd cloud && docker compose up -d --build
docker compose ps
curl http://localhost:8787/health
# -> {"ok":true,"service":"zut-cloud",...}
curl https://cloud.yourdomain.com/health
```

## 3. Wire the frontend

Supabase SQL editor → run `supabase/usage_meter.sql` (adds free-plan caps table).

Build the PWA with two env vars:

```bash
VITE_SUPABASE_URL=https://YOUR_REF.supabase.co \
VITE_SUPABASE_ANON_KEY=eyJ... \
VITE_CLOUD_URL=https://cloud.yourdomain.com \
npm run build
```

Deploy `dist/` to Cloudflare Pages / Vercel / Netlify (static, free).
Phone/Chromebook users then "Install" it from the browser menu (PWA).

## 4. Smoke test (do this before inviting users)

1. Open the PWA, sign in.
2. AI panel → backend defaults to **Cloud agent** (green when `VITE_CLOUD_URL` set).
3. Paste OpenRouter key once (`sk-or-…`, stays in that browser only).
4. Prompt: "add a dark mode toggle". Expect reply + `applied N file changes`.
5. No key / logged out → clear error, direct OpenRouter tab still works.

Server logs: `docker compose logs -f zut-cloud` shows
`[zut-cloud] agent ok uid=… pid=… +1 ~2 -0`.

## 5. Costs & limits (defaults)

- OneNetwork VPS: whatever your panel shows for 2vCPU/4GB (typical NG range ₦11k–₦35k/mo).
  This one box handles ~10–20 active builders. Scale by sizing up, not by adding boxes.
- Supabase free + Pages free + BYOK = ₦0 extra.
- Defaults protect you: `ZUT_MONTHLY_AGENT_CAP=50` turns/user/month,
  `ZUT_RATE_AGENT_MIN=10`, `ZUT_MAX_BODY=8MB`, workspaces capped at 512KB/file.
- Data lives in Docker volume `zut-data` (`/data/<uid>/<projectId>/`).
  Back up with `docker run --rm -v zut-data:/d -v $PWD:/b ubuntu tar czf /b/zut-backup.tgz /d`.

## 6. Update later

```bash
cd ~/zut && git pull && cd cloud && docker compose up -d --build
```

## Troubleshooting

- `503 Server missing SUPABASE…` → `cloud.env` not loaded (`env_file` path).
- `401 Sign in required` → frontend `VITE_SUPABASE_URL` ≠ backend `SUPABASE_URL` project.
- `Agent binary failed` → opencode install step failed in build; `docker compose exec zut-cloud opencode --version`.
- Slow first agent turn (~20–40s): model cold-start + `npm` fetch via esm.sh. Normal.
- 1 GB VPS OOMs: expected — move to 4 GB.
