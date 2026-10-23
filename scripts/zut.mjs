// zut — one word in any terminal, on any machine path, brings the IDE up.
//
//   zut            open the IDE right here: pixel UI if this terminal can
//                  draw kitty graphics, otherwise the default browser
//   zut term       force the pixel-in-terminal client
//   zut web        force the browser
//   zut down       stop the local stack
//   zut status     what is running, is it healthy
//   zut logs       tail every service log
//
// The stack is shared: `zut` from two terminals attaches to the same agent.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL = 'http://127.0.0.1:5173/';
const STACK = path.join(ROOT, 'scripts', 'local-stack.mjs');
const TERM = path.join(ROOT, 'terminal', 'bin', 'zut-term.mjs');

const command = process.argv[2] || '';

function graphicsTerminal() {
  const t = (process.env.TERM || '').toLowerCase();
  return (
    /kitty|ghostty|wezterm|foot/.test(t) ||
    !!process.env.KITTY_WINDOW_ID ||
    !!process.env.GHOSTTY_RESOURCES_DIR ||
    !!process.env.WEZTERM_EXECUTABLE
  );
}

async function waitUp(timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(URL);
      if (res.status < 500) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function openInBrowser() {
  console.log(`  starting the stack…`);
  const up = spawn(process.execPath, [STACK, 'up'], {
    cwd: ROOT,
    stdio: 'ignore',
    detached: true,
  });
  up.unref();
  if (!(await waitUp())) {
    console.error(`  zut: the stack never answered at ${URL} — try \`zut logs\`.`);
    process.exit(1);
  }
  const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
  try {
    spawn(opener, [URL], { stdio: 'ignore', detached: true }).on('error', () => {});
  } catch {}
  console.log(`  ready: ${URL}`);
  console.log(`  quit later with zut down · status with zut status · logs with zut logs`);
}

async function openInTerminal() {
  if (!graphicsTerminal()) {
    console.log(`  zut: this terminal cannot draw kitty graphics — falling back to the browser.`);
    await openInBrowser();
    return;
  }
  const stack = spawn(process.execPath, [STACK, 'up'], { cwd: ROOT, stdio: 'inherit' });
  stack.on('exit', (code) => {
    if (code !== 0) process.exit(code ?? 1);
    const term = spawn(process.execPath, [TERM, '--url', URL], { cwd: ROOT, stdio: 'inherit' });
    term.on('exit', (c) => process.exit(c ?? 0));
  });
}

async function passthrough(...args) {
  const child = spawn(process.execPath, [STACK, ...args], { cwd: ROOT, stdio: 'inherit' });
  child.on('exit', (code) => process.exit(code ?? 0));
}

const HELP = `zut — the Zut IDE in one word

  zut            open here: pixel UI in kitty/ghostty/wezterm/foot, else browser
  zut term       force the pixel-in-terminal client
  zut web        force the browser
  zut down       stop the local stack
  zut status     stack health
  zut logs       tail service logs
  zut help       this`;

const handlers = {
  term: openInTerminal,
  web: openInBrowser,
  down: () => passthrough('down'),
  stop: () => passthrough('down'),
  status: () => passthrough('status'),
  logs: () => passthrough('logs'),
  help: () => console.log(HELP),
};

if (command in handlers) await handlers[command]();
else if (command.startsWith('-')) console.log(HELP);
else await openInTerminal();
