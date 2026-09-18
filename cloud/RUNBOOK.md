# zut-cloud RUNBOOK — when the VPS misbehaves

SSH in, then match the symptom. All commands run in `~/zut/cloud`
unless noted. Compose service name: `zut-cloud`.

## "Site loads, agent says 503 / sign-in errors"

Auth env missing or Supabase unreachable.

```bash
docker compose exec zut-cloud env | grep -c SUPABASE  # expect 2-3
docker compose logs --tail 50 zut-cloud | grep -i "supabase\|agent"
curl -s http://localhost:8787/health
```

Fix: fill `cloud.env` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`), `docker compose up -d`.

## "Agent busy / 429 for everyone"

Queue saturated or a stuck opencode child.

```bash
docker compose logs --tail 100 zut-cloud | grep "agent ok"   # any completions?
docker compose exec zut-cloud ps aux | grep -c opencode      # expect <= ZUT_AGENT_CONCURRENCY+1
docker compose restart zut-cloud                             # drains queue, keeps /data (volume)
```

If chronic: raise `ZUT_AGENT_CONCURRENCY` to 3 (needs 6GB+ box) or lower
`ZUT_AGENT_TIMEOUT_MS`.

## OOM / container restarting

```bash
docker stats --no-stream
dmesg | tail -5 | grep -i "killed process"   # OOM-killer evidence
```

Fix: `docker compose down && docker compose up -d` for immediate relief,
then size the VPS up (4GB minimum with agents on). The compose file already
caps the service at 3GB so one turn can't take the box.

## Disk full (workspaces grow)

```bash
du -sh /var/lib/docker/volumes/cloud_zut-data/_data 2>/dev/null || docker system df
```

Per-project cap (`ZUT_WORKSPACE_MAX_MB`, default 50) stops growth; existing
over-quota dirs need manual pruning. Prune images too: `docker image prune -f`.

## opencode broke after an update

The Dockerfile pins nothing — a fresh build pulls latest.

```bash
docker compose exec zut-cloud opencode --version
```

Pin by editing `cloud/Dockerfile` to a known binary URL, rebuild. Keep the
last working image: `docker tag zut-cloud:latest zut-cloud:backup` before
six-monthly rebuilds.

## Quota reset for a user (support request)

File counter: `rm /data/.usage/<uid>-YYYY-MM.count` (exec into the volume via
`docker compose exec zut-cloud sh`). Durable rows in `usage_meter` are audit
only — the file counter is the live gate.

## Full backup / restore

```bash
docker run --rm -v cloud_zut-data:/d -v $PWD:/b ubuntu tar czf /b/zut-backup.tgz /d
# restore:
docker run --rm -v cloud_zut-data:/d -v $PWD:/b ubuntu tar xzf /b/zut-backup.tgz -C /
```

## Keys leaked / rotate

1. Supabase Dashboard → Project Settings → API → regenerate `service_role`
   (and `anon` if the `.env` leak worries you — anon is public-by-design but
   rotation is free).
2. Update `cloud.env` + frontend `.env` / Pages secrets, `docker compose up -d`,
   redeploy frontend. Old JWTs expire within an hour.
