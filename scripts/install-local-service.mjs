// Installs the local stack as a systemd --user service, so the IDE and the
// local opencode agent are up at login — no command to type.
//
//   npm run local:install     install + start now
//   npm run local:uninstall   stop and remove
//
// User units (not system units): no root, they die with your session.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UNIT_DIR = path.join(os.homedir(), '.config', 'systemd', 'user');
const UNIT = path.join(UNIT_DIR, 'zut-local-stack.service');
const TEMPLATE = path.join(ROOT, 'scripts', 'zut-local-stack.service');
const WORKSPACE = path.resolve(
  process.env.ZUT_WORKSPACE ?? path.join(os.homedir(), '.zut-projects', 'default'),
);

function systemctl(...args) {
  return execFileSync('systemctl', ['--user', ...args], { encoding: 'utf8' });
}

const action = process.argv[2] ?? 'install';

if (action === 'uninstall') {
  try {
    systemctl('disable', '--now', 'zut-local-stack.service');
  } catch {
    /* not installed */
  }
  rmSync(UNIT, { force: true });
  try {
    systemctl('daemon-reload');
  } catch {
    /* no systemd */
  }
  console.log('[local] service removed');
  process.exit(0);
}

if (!existsSync('/run/systemd/system')) {
  console.error('[local] systemd is not running here — start the stack manually with `npm run local`.');
  process.exit(1);
}

mkdirSync(UNIT_DIR, { recursive: true });
const unit = readFileSync(TEMPLATE, 'utf8')
  .replaceAll('__REPO__', ROOT)
  .replaceAll('__NODE__', process.execPath)
  .replaceAll('__WORKSPACE__', WORKSPACE);
writeFileSync(UNIT, unit);

systemctl('daemon-reload');
systemctl('enable', '--now', 'zut-local-stack.service');

console.log(`[local] installed ${UNIT}`);
console.log('[local] started — the IDE is on http://127.0.0.1:5173/');
console.log('[local] logs: journalctl --user -u zut-local-stack -f');
console.log('[local] stop:  systemctl --user stop zut-local-stack');
