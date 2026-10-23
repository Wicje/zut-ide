import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const OUT = process.env.ZUT_SHOTS || '/home/zk3/mac/zut-ui-guide';
mkdirSync(OUT, { recursive: true });
const APP = 'http://127.0.0.1:5173/';

let n = 15;
const names = [];
const shot = async (page, name) => {
  const file = String(++n).padStart(2, '0') + '-' + name + '.png';
  await page.screenshot({ path: `${OUT}/${file}` });
  names.push(file);
  console.log('  ✓', file);
};

const clickSel = async (page, sel) => {
  try { const el = await page.$(sel); if (el) { await el.click(); return true; } } catch {}
  return false;
};
const clickText = async (page, pat, strict = false) =>
  page.evaluate((p, st) => {
    const re = new RegExp(p, 'i');
    const els = [...document.querySelectorAll('button, a, [role=button], [title], [aria-label]')];
    for (const e of els) {
      const t = (e.textContent || '').trim();
      const ti = e.getAttribute('title') || '';
      const al = e.getAttribute('aria-label') || '';
      const ok = st ? (t === p || ti === p) : (re.test(t) || re.test(ti) || re.test(al));
      if (ok && e.offsetParent !== null) { e.click(); return true; }
    }
    return false;
  }, pat, strict);

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--window-size=1440,900'],
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 2 },
});
const app = await browser.newPage();
await app.goto(APP, { waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2200));

// sidebar flows first (nothing destructive)
const sidebar = [
  ['New project', 'new-project-modal', 900],
  ['Open folder', 'open-folder-modal', 900],
  ['Import repo', 'import-repo-modal', 900],
  ['Open host', 'host-settings-modal', 900],
  ['Commands', 'command-palette', 900],
  ['Customize', 'customize-modal', 900],
  ['Git', 'git-panel', 900],
];
for (const [label, name, wait] of sidebar) {
  const opened = await clickText(app, label, true) || await clickText(app, label);
  await new Promise((r) => setTimeout(r, wait));
  await shot(app, name);
  await app.keyboard.press('Escape').catch(() => {});
  await new Promise((r) => setTimeout(r, 350));
}

// agent turn against the real local agent
const box = 'input[placeholder*="Plan, search, build anything"]';
if (await app.$(box)) {
  await app.click(box);
  await app.type(box, 'Change the main heading of the page to exactly: ZUT WORKS', { delay: 10 });
  await new Promise((r) => setTimeout(r, 600));
  await shot(app, 'composer-armed');
  await app.keyboard.press('Enter');
  await new Promise((r) => setTimeout(r, 4000));
  await shot(app, 'agent-thinking');
  await new Promise((r) => setTimeout(r, 22000));
  await shot(app, 'agent-done-diff');
  await new Promise((r) => setTimeout(r, 4000));
  await shot(app, 'agent-review-ready');
} else {
  console.log('  !! composer input not found');
}

// right-pane tabs now that there may be a diff
for (const [label, name] of [['Code', 'editor-code'], ['Preview', 'live-preview'], ['Checks', 'checks-pane']]) {
  const opened = await clickText(app, label, true);
  await new Promise((r) => setTimeout(r, 1600));
  if (opened) await shot(app, name);
}

// console drawer from the status row
await clickText(app, 'Console');
await new Promise((r) => setTimeout(r, 900));
await shot(app, 'console-drawer');
await app.keyboard.press('Escape').catch(() => {});

// deploy + overflow
const deployOpened = await clickText(app, 'Deploy', true) || await clickText(app, 'Deploy to the web');
await new Promise((r) => setTimeout(r, 1100));
await shot(app, 'deploy-flow');
await app.keyboard.press('Escape').catch(() => {});
await new Promise((r) => setTimeout(r, 400));

const more = await app.evaluate(() => {
  const cands = [...document.querySelectorAll('button')];
  const b = cands.find((e) => e.offsetParent !== null && ['⋯', '···', '...', 'More'].includes((e.textContent || '').trim()))
    || cands.find((e) => e.offsetParent !== null && /more/i.test(e.getAttribute('aria-label') || ''));
  if (b) { b.click(); return true; }
  return false;
});
if (more) { await new Promise((r) => setTimeout(r, 700)); await shot(app, 'title-bar-overflow'); 
  await app.keyboard.press('Escape').catch(() => {}); }

// account popover bottom-left
await clickText(app, 'Guest');
await new Promise((r) => setTimeout(r, 800));
await shot(app, 'account-popover');

// left sidebar with the project files after the turn
await app.evaluate(() => window.scrollTo(0, 0));
await shot(app, 'sidebar-with-project');

await browser.close();
console.log('\nround-2 files:\n' + names.join('\n'));
