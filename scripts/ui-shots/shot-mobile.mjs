import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.resolve(ROOT, 'scripts', 'ui-shots', 'feature-shots');
mkdirSync(OUT, { recursive: true });

const APP = 'http://127.0.0.1:5173/';
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: 'new',
  args: ['--no-sanitize-url', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
});
const page = await browser.newPage();
await page.goto(APP, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 3500));

// Verify the mobile page actually rendered the IDE (has the Zut mark / composer).
const hasIde = await page.evaluate(() => {
  const body = document.body.innerText || '';
  return body.includes('Zut') || body.includes('Plan, search') || document.querySelector('[aria-label*="sidebar"], [class*="sidebar"], nav') != null;
}).catch(() => false);
console.log('mobile page has IDE indicators:', hasIde);

try { await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; }); } catch {}
await new Promise((r) => setTimeout(r, 800));

const file = '09-ide-mobile-current.png';
const dest = path.join(OUT, file);
const buf = await page.screenshot({ fullPage: false });
console.log('screenshot bytes', buf.length, 'dest', dest);
writeFileSync(dest, buf);
console.log('on disk:', existsSync(dest), 'size', existsSync(dest) ? statSync(dest).size : 'n/a');
await browser.close();
await new Promise((r) => setTimeout(r, 300));
console.log('final:', existsSync(dest), existsSync(dest) ? statSync(dest).size : 'n/a');

