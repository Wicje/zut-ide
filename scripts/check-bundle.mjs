// P1 perf budget: fails CI when the app shell grows past what cheap
// phones/Chromebooks can cold-start. Run after `npm run build:vercel`.
// Wasm (esbuild, ~11MB) is excluded — precached once by the service worker.
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, '..', 'dist');

// Single-deploy contract first: landing at /, IDE at /app.
for (const [f, needle] of [
  ['index.html', 'data-waitlist'],
  ['app/index.html', 'id="root"'],
]) {
  const p = path.join(dist, f);
  let html = '';
  try {
    html = readFileSync(p, 'utf8');
  } catch {
    console.error(`[check-bundle] MISSING ${f} — did assemble-vercel run?`);
    process.exit(1);
  }
  if (!html.includes(needle)) {
    console.error(`[check-bundle] ${f} does not look right (missing ${needle}).`);
    process.exit(1);
  }
}

const wasm = readdirSync(path.join(dist, 'assets')).filter((f) => f.endsWith('.wasm'));
if (wasm.length === 0) {
  console.error('[check-bundle] esbuild wasm missing from dist/assets — offline builds will break.');
  process.exit(1);
}

// Gzip budget for everything the shell needs on first paint (JS + CSS).
const BUDGET_KB = 600;
let total = 0;
const rows = [];
for (const f of readdirSync(path.join(dist, 'assets'))) {
  if (!/\.(js|css)$/.test(f)) continue;
  const buf = readFileSync(path.join(dist, 'assets', f));
  const gz = gzipSync(buf).length;
  total += gz;
  rows.push([f, (gz / 1024).toFixed(1) + 'kb']);
}
rows.sort((a, b) => parseFloat(b[1]) - parseFloat(a[1]));
for (const [f, s] of rows.slice(0, 8)) console.log(`[check-bundle] ${s}  ${f}`);
const kb = total / 1024;
console.log(`[check-bundle] total gzip js+css: ${kb.toFixed(0)}kb / ${BUDGET_KB}kb`);
if (kb > BUDGET_KB) {
  console.error('[check-bundle] OVER BUDGET — lazy-load the new import or raise BUDGET_KB with justification.');
  process.exit(1);
}
console.log('[check-bundle] OK');
