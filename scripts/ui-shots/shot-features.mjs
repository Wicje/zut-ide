import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.resolve(ROOT, 'scripts', 'ui-shots', 'feature-shots');
mkdirSync(OUT, { recursive: true });

const APP = 'http://127.0.0.1:5173/';
let n = 0;
const names = [];
async function shot(page, name) {
  const file = String(++n).padStart(2, '0') + '-' + name + '.png';
  const buf = await page.screenshot({ fullPage: false });
  writeFileSync(path.join(OUT, file), buf);
  names.push(file);
  console.log('  ✓', file, 'bytes', buf.length);
}

async function clickText(page, pat, strict = false) {
  return page.evaluate((p, st) => {
    const re = new RegExp(p, 'i');
    const els = [...document.querySelectorAll('button, a, [role=button], [title], [aria-label]')];
    for (const e of els) {
      const t = (e.textContent || '').trim();
      const ti = e.getAttribute('title') || '';
      const al = e.getAttribute('aria-label') || '';
      const ok = st ? (t === p || ti === p || al === p) : (re.test(t) || re.test(ti) || re.test(al));
      if (ok && e.offsetParent !== null) { e.click(); return true; }
    }
    return false;
  }, pat, strict);
}

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--window-size=1440,900'],
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
});

const page = await browser.newPage();
await page.goto(APP, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 3500));
try { await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; }); } catch {}
await new Promise((r) => setTimeout(r, 800));
await shot(page, 'ide-dark-first-open');

// Composer: real keystrokes via page.type so React's onChange fires.
const composerSel = 'input[type="text"][placeholder*="Plan, search"]';
const composer = await page.$(composerSel);
if (!composer) {
  composer = await page.evaluate((sel) => {
    const els = document.querySelectorAll(sel);
    return Array.from(els).find((e) => e.offsetParent !== null && e.getBoundingClientRect().width > 40) || null;
  }, composerSel);
}

if (composer) {
  await composer.click();
  await new Promise((r) => setTimeout(r, 600));
  await shot(page, 'composer-armed');

  const prompt = 'Add a visible "MADE WITH ZUT" badge to the page header.';
  await page.type(composerSel, prompt, { delay: 12 });
  await new Promise((r) => setTimeout(r, 700));
  await shot(page, 'composer-typed-prompt');

  await composer.click();
  await page.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 2500));
  await shot(page, 'agent-at-work');

  // Wait up to 180s for the turn to land.
  try {
    await page.waitForFunction(() => {
      const t = document.body.innerText || '';
      return t.includes('checkpoints') || t.includes('Review') || t.includes('diff') ||
        t.includes('added') || t.includes('changed') || t.includes('MADE WITH ZUT') || t.includes('badge');
    }, { timeout: 180000 });
    await new Promise((r) => setTimeout(r, 3000));
  } catch {}
  await shot(page, 'agent-after-turn');

  for (const label of ['Review', 'Diff', 'diff']) {
    if (await clickText(page, label)) {
      await new Promise((r) => setTimeout(r, 1500));
      await shot(page, 'right-pane-diff');
      break;
    }
  }
  if (await clickText(page, 'Preview')) {
    await new Promise((r) => setTimeout(r, 2000));
    await shot(page, 'right-pane-preview');
  }
  if (await clickText(page, 'Checks')) {
    await new Promise((r) => setTimeout(r, 1500));
    await shot(page, 'right-pane-checks');
  }
  if (await clickText(page, 'Run')) {
    await new Promise((r) => setTimeout(r, 1500));
    await shot(page, 'right-pane-run');
  }
} else {
  console.log('  !! composer input not found');
}

await browser.close();
console.log(`\n${names.length} feature shots in ${OUT}\n` + names.join('\n'));
