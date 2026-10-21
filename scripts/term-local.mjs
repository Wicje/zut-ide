// Starts the local stack (including the dev server) and then hands the
// terminal client the same URL, so the terminal and the browser show the
// same IDE — and the same local agent — at the same time.
//
//   npm run term:local
//
// The dev server is used (not the production build) so the terminal shows
// your latest changes without a rebuild.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const URL = 'http://127.0.0.1:5173/';

const stack = spawn(process.execPath, [path.join(ROOT, 'scripts', 'local-stack.mjs'), 'up'], {
  cwd: ROOT,
  stdio: 'inherit',
});
stack.on('exit', (code) => {
  if (code !== 0) process.exit(code ?? 1);
  const term = spawn(process.execPath, [path.join(ROOT, 'terminal', 'bin', 'zut-term.mjs'), '--url', URL], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  term.on('exit', (c) => process.exit(c ?? 0));
});
