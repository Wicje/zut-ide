// P1 observability: probe the public front door plus any configured
// backends. Env (all optional; missing targets are skipped, not failed):
//   APP_URL      production site (default: http://127.0.0.1:4173)
//   RUNTIME_URL  broker/runtime base (VITE_RUNTIME_URL)
//   CLOUD_URL    zut-cloud base (VITE_CLOUD_URL)
const targets = [
  ['app', `${process.env.APP_URL ?? 'http://127.0.0.1:4173'}/`, null],
  ['broker', process.env.RUNTIME_URL, '/health'],
  ['cloud', process.env.CLOUD_URL, '/health'],
];

let failed = 0;
for (const [name, base, health] of targets) {
  if (!base) {
    console.log(`[health] ${name}: skipped (not configured)`);
    continue;
  }
  const url = health ? base.replace(/\/+$/, '') + health : base;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15_000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    console.log(`[health] ${name}: OK ${url}`);
  } catch (e) {
    failed += 1;
    console.error(`[health] ${name}: FAIL ${url} — ${(e).message}`);
  }
}
if (failed > 0) {
  console.error(`[health] ${failed} target(s) unhealthy`);
  process.exit(1);
}
console.log('[health] all configured targets healthy');
