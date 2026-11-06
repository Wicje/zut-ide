import puppeteer from 'puppeteer-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = path.join(ROOT, 'landing', 'images');
mkdirSync(OUT_DIR, { recursive: true });

// Hero visual is 1020px max-width on the page; screenshot a bit wider so the
// crop stays clean and the float shots are still in frame.
const WIDTH = 1280;
const HEIGHT = 720;

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: 'new',
  args: [
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--window-size=1280,720',
  ],
  defaultViewport: { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2 },
});

const page = await browser.newPage();
await page.goto('http://127.0.0.1:8812/', { waitUntil: 'networkidle2', timeout: 60000 });
await page.waitForSelector('.hero', { timeout: 30000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 1200));

// Prefer the dark hero; the existing shot-app.jpg was the dark shell.
try { await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; }); } catch {}
await new Promise((r) => setTimeout(r, 700));

const outPath = path.join(OUT_DIR, 'shot-app.jpg');
await page.screenshot({ path: outPath, fullPage: false });
console.log('wrote', outPath);
console.log('size', WIDTH, 'x', HEIGHT);

await browser.close();
