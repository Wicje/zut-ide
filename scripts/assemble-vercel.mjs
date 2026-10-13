// Single-deploy assembly for Vercel: / = landing (waitlist), /app = IDE.
// Vite builds the IDE to dist/index.html. This moves it to dist/app/index.html
// and copies the static landing page to dist/ root.
// Run via: npm run build:vercel
import { cpSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const landing = path.join(root, 'landing');

if (!existsSync(path.join(dist, 'index.html'))) {
  console.error('[assemble-vercel] dist/index.html missing — run `vite build` first.');
  process.exit(1);
}
if (!existsSync(path.join(landing, 'index.html'))) {
  console.error('[assemble-vercel] landing/index.html missing.');
  process.exit(1);
}

// 1. Move IDE shell -> dist/app/index.html (assets stay absolute at /assets/*).
const appDir = path.join(dist, 'app');
mkdirSync(appDir, { recursive: true });
const ideHtml = path.join(dist, 'index.html');
const appHtml = path.join(appDir, 'index.html');
if (existsSync(appHtml)) rmSync(appHtml);
renameSync(ideHtml, appHtml);

// 2. Copy landing static files to dist root (relative hrefs keep working).
cpSync(path.join(landing, 'index.html'), path.join(dist, 'index.html'));
for (const f of ['styles.css', 'script.js']) {
  const src = path.join(landing, f);
  if (existsSync(src)) cpSync(src, path.join(dist, f));
}
const imgSrc = path.join(landing, 'images');
if (existsSync(imgSrc)) {
  const imgDst = path.join(dist, 'images');
  rmSync(imgDst, { recursive: true, force: true });
  cpSync(imgSrc, imgDst, { recursive: true });
}

console.log('[assemble-vercel] OK: / -> landing, /app/ -> IDE.');
