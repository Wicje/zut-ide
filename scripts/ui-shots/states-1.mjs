import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const OUT = process.env.ZUT_SHOTS || '/home/zk3/mac/zut-ui-guide';
mkdirSync(OUT, { recursive: true });

const APP = 'http://127.0.0.1:5173/';
const DIST = 'http://127.0.0.1:8812/';
const GATE = 'http://gate.zut.local:8812/app/';

let n = 0;
const names = [];

async function shot(page, name) {
  const file = String(++n).padStart(2, '0') + '-' + name + '.png';
  await page.screenshot({ path: `${OUT}/${file}` });
  names.push(file);
  console.log('  ✓', file);
}

async function clickText(page, pattern) {
  return page.evaluate((pat) => {
    const re = new RegExp(pat, 'i');
    const els = [...document.querySelectorAll('button, a, [role=button], [title]')];
    const hit = els.find((e) => re.test(e.textContent || '') || re.test(e.getAttribute('title') || ''));
    if (!hit) return false;
    hit.click();
    return (hit.textContent || hit.getAttribute('title') || '').trim().slice(0, 40);
  }, pattern);
}

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--host-resolver-rules=MAP gate.zut.local 127.0.0.1', '--window-size=1440,900'],
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
});

// 1-3: the IDE, as painted on 127.0.0.1 (no gate, live local agent)
const app = await browser.newPage();
await app.goto(APP, { waitUntil: 'networkidle2', timeout: 60000 });
await app.waitForSelector('textarea', { timeout: 30000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 2500));
await shot(app, 'ide-first-open-light');

await app.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
await new Promise((r) => setTimeout(r, 900));
await shot(app, 'ide-first-open-dark');
await app.evaluate(() => { document.documentElement.dataset.theme = 'light'; });

// agent modes row in composer — hover pills
const composerSel = 'textarea';
if (await app.$(composerSel)) {
  await app.click(composerSel);
  await app.type(composerSel, 'Add a line to the page header that says MADE WITH ZUT', { delay: 12 });
  await new Promise((r) => setTimeout(r, 700));
  await shot(app, 'composer-typed-prompt');

  await app.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 2800));
  await shot(app, 'agent-at-work');
  await new Promise((r) => setTimeout(r, 12000));
  await shot(app, 'agent-review-diff');

  for (const mode of ['diff', 'split', 'preview', 'checks']) {
    if (await clickText(app, mode === 'preview' ? 'Build the preview' : mode)) {
      await new Promise((r) => setTimeout(r, 1800));
      await shot(app, 'right-pane-' + mode);
    }
  }

  await clickText(app, 'Deploy to the web');
  await new Promise((r) => setTimeout(r, 1200));
  await shot(app, 'deploy-to-the-web');
  await app.keyboard.press('Escape').catch(() => {});
  await clickText(app, 'More pane actions');
  await new Promise((r) => setTimeout(r, 700));
  await shot(app, 'overflow-menu');
  await app.keyboard.press('Escape').catch(() => {});

  await clickText(app, 'Plan the next steps|Plan mode');
  await new Promise((r) => setTimeout(r, 800));
  await shot(app, 'plan-mode');
}

// host / agent-home modal
await clickText(app, 'Copy the whole diff') && 0;
if (await clickText(app, 'Host|agent runs|On your machine')) {
  await new Promise((r) => setTimeout(r, 900));
  await shot(app, 'agent-home');
  await app.keyboard.press('Escape').catch(() => {});
}

// crops: tabs row & sidebar
const tabsSel = '[aria-label="Open files"]';
if (await app.$(tabsSel)) {
  const el = await app.$(tabsSel);
  const box = await el.boundingBox().catch(() => null);
  if (box) {
    await app.screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-open-file-tabs.png`, clip: { x: 0, y: Math.max(0, box.y - 30), width: 1440, height: 140 } });
    names.push(String(n).padStart(2, '0') + '-open-file-tabs.png');
    console.log('  ✓ open-file-tabs (crop)');
  }
}

// mobile IDE
const mob = await browser.newPage();
await mob.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await mob.goto(APP, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));
await shot(mob, 'ide-mobile');

// gate + auth on a "real" host (gate.zut.local → 127.0.0.1), static dist
const gated = await browser.newPage();
await gated.goto(GATE, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1800));
await shot(gated, 'account-gate');
await clickText(gated, 'Sign up|Create account');
await new Promise((r) => setTimeout(r, 900));
await shot(gated, 'auth-signup');
await clickText(gated, 'Do you have an|Sign in|sign in');
await new Promise((r) => setTimeout(r, 700));
await shot(gated, 'auth-signin');
await clickText(gated, 'Email me a sign-in link');
await new Promise((r) => setTimeout(r, 600));
await shot(gated, 'auth-magic-link');

// landing from the static dist (identical to prod)
const land = await browser.newPage();
await land.goto(DIST, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1200));
await shot(land, 'landing-hero-light');
await land.evaluate(() => { document.documentElement.dataset.theme = 'dark'; });
await new Promise((r) => setTimeout(r, 700));
await shot(land, 'landing-hero-dark');
await land.evaluate(() => document.querySelector('#compute')?.scrollIntoView());
await new Promise((r) => setTimeout(r, 600));
await shot(land, 'landing-zut-compute');
await land.evaluate(() => document.querySelector('#faq')?.scrollIntoView());
await new Promise((r) => setTimeout(r, 600));
await shot(land, 'landing-faq');
await land.evaluate(() => window.scrollTo(0, 99999));
await new Promise((r) => setTimeout(r, 600));
await shot(land, 'landing-final-cta');

const mobl = await browser.newPage();
await mobl.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await mobl.goto(DIST, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1200));
await shot(mobl, 'landing-mobile');

await browser.close();
console.log(`\n${names.length} screenshots in ${OUT}\n` + names.join('\n'));
