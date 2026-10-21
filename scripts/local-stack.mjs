// Local stack for using Zut on this laptop, before the VPS exists.
//
//   npm run local          start everything (reuses what is already up)
//   npm run local:status   what is running, and is it healthy
//   npm run local:down     stop what this script started
//   npm run local:logs     tail every service log
//
// Five processes, one workspace (~/.zut-projects/default):
//
//   opencode serve :4096   the coding agent — models, tools, file edits
//   file bridge    :4331   IDE project files <-> disk workspace
//   zut host       :8790   real workspace, git, real terminal
//   zut broker     :8787   program runs (python/go) and previews
//   vite dev       :5173   the IDE itself
//
// The terminal client attaches to the same vite server, so the browser and
// the terminal show the same app at the same time:
//
//   npm run term -- --url http://127.0.0.1:5173/
//
// Every service binds loopback only. Nothing is exposed to the network.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE = path.join(ROOT, '.zut-local');
const LOGS = path.join(STATE, 'logs');
const PIDS = path.join(STATE, 'pids.json');
const WORKSPACE = path.resolve(
  process.env.ZUT_WORKSPACE ?? path.join(os.homedir(), '.zut-projects', 'default'),
);

function opencodeBin() {
  const local = path.join(os.homedir(), '.opencode', 'bin', 'opencode');
  return existsSync(local) ? local : 'opencode';
}

/** Server secrets from .env — the broker verifies users and holds API keys. */
function envFile() {
  const file = path.join(ROOT, '.env');
  if (!existsSync(file)) return {};
  try {
    process.loadEnvFile(file);
  } catch {
    /* older node */
  }
  return process.env;
}

const SECRETS = envFile();

const SERVICES = [
  {
    name: 'opencode',
    port: 4096,
    health: 'http://127.0.0.1:4096/global/health',
    cmd: opencodeBin(),
    args: ['serve', '--port', '4096', '--hostname', '127.0.0.1'],
    cwd: WORKSPACE,
  },
  {
    name: 'bridge',
    port: 4331,
    health: 'http://127.0.0.1:4331/health',
    cmd: process.execPath,
    args: [path.join(ROOT, 'scripts', 'file-bridge.mjs')],
    env: { ZUT_WORKSPACE: WORKSPACE, ZUT_BRIDGE_PORT: '4331' },
  },
  {
    name: 'host',
    port: 8790,
    health: 'http://127.0.0.1:8790/health',
    cmd: process.execPath,
    args: [path.join(ROOT, 'host', 'server.mjs')],
    env: { ZUT_WORKSPACE: WORKSPACE, PORT: '8790', ZUT_HOST_MODE: 'selfhost' },
  },
  {
    name: 'broker',
    port: 8787,
    health: 'http://127.0.0.1:8787/health',
    cmd: process.execPath,
    args: [path.join(ROOT, 'broker', 'server.mjs')],
    env: {
      PORT: '8787',
      // No VPS and no signed-in Supabase session yet: allow anonymous runs
      // from loopback so the Run button works locally.
      ZUT_BROKER_DEV_ALLOW_ANON: '1',
      SUPABASE_URL: SECRETS.SUPABASE_URL ?? '',
      SUPABASE_ANON_KEY: SECRETS.SUPABASE_ANON_KEY ?? '',
      ZUT_MUDBASE_API_KEY: SECRETS.ZUT_MUDBASE_API_KEY ?? '',
    },
  },
  {
    name: 'vite',
    port: 5173,
    health: 'http://127.0.0.1:5173/',
    cmd: process.execPath,
    args: [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', '5173', '--host', '127.0.0.1'],
  },
];

function portOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(700);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

async function healthy(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return res.status < 500;
  } catch {
    return false;
  }
}

function readPids() {
  try {
    return JSON.parse(readFileSync(PIDS, 'utf8'));
  } catch {
    return {};
  }
}

function writePids(pids) {
  mkdirSync(STATE, { recursive: true });
  writeFileSync(PIDS, `${JSON.stringify(pids, null, 2)}\n`);
}

function startService(service) {
  mkdirSync(LOGS, { recursive: true });
  const logPath = path.join(LOGS, `${service.name}.log`);
  const fd = openSync(logPath, 'a');
  const child = spawn(service.cmd, service.args, {
    cwd: service.cwd ?? ROOT,
    env: { ...process.env, ...(service.env ?? {}) },
    detached: true,
    stdio: ['ignore', fd, fd],
  });
  child.unref();
  return { pid: child.pid, log: logPath };
}

const argv = process.argv.slice(2);
const command = argv.find((a) => !a.startsWith('--')) ?? 'up';
const QUIET = argv.includes('--quiet');
// The vite plugin calls us from inside the dev server — vite is already up.
const SKIP_VITE = argv.includes('--no-vite');

function say(message) {
  if (!QUIET) console.log(message);
}

async function up() {
  if (process.env.CI) {
    say('[local] skipped (CI)');
    return;
  }
  mkdirSync(WORKSPACE, { recursive: true });
  mkdirSync(LOGS, { recursive: true });
  const pids = readPids();

  for (const service of SERVICES) {
    if (SKIP_VITE && service.name === 'vite') continue;
    if (await portOpen(service.port)) {
      say(`[local] ${service.name}: already up on :${service.port} — reusing it`);
      continue;
    }
    const { pid, log } = startService(service);
    pids[service.name] = { pid, port: service.port, log };
    const deadline = Date.now() + 45_000;
    let ok = false;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 400));
      if (await healthy(service.health)) {
        ok = true;
        break;
      }
      if (!pidAlive(pid)) break;
    }
    console.log(
      ok
        ? `[local] ${service.name}: up on :${service.port} (pid ${pid})`
        : `[local] ${service.name}: FAILED to come up on :${service.port} — see ${log}`,
    );
  }

  writePids(pids);
  if (QUIET) return;
  console.log('');
  console.log('  browser   http://127.0.0.1:5173/');
  console.log('  terminal  npm run term -- --url http://127.0.0.1:5173/');
  console.log(`  workspace ${WORKSPACE}`);
  console.log(`  logs      ${LOGS}`);
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function down() {
  const pids = readPids();
  for (const [name, info] of Object.entries(pids)) {
    const pid = Number(info.pid);
    if (!pid || !pidAlive(pid)) {
      console.log(`[local] ${name}: not running`);
      continue;
    }
    try {
      // Detached children are their own process group: kill the whole tree.
      process.kill(-pid, 'SIGTERM');
    } catch {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        /* already gone */
      }
    }
    console.log(`[local] ${name}: stopped (pid ${pid})`);
  }
  rmSync(PIDS, { force: true });
}

async function status() {
  for (const service of SERVICES) {
    const up = await portOpen(service.port);
    const ok = up ? await healthy(service.health) : false;
    const state = !up ? 'down' : ok ? 'healthy' : 'up (no health)';
    console.log(`[local] ${service.name.padEnd(9)} :${String(service.port).padEnd(5)} ${state}`);
  }
  console.log('');
  console.log('  browser   http://127.0.0.1:5173/');
  console.log('  terminal  npm run term -- --url http://127.0.0.1:5173/');
}

async function logs() {
  mkdirSync(LOGS, { recursive: true });
  const files = SERVICES.map((s) => path.join(LOGS, `${s.name}.log`));
  const child = spawn('tail', ['-n', '40', '-F', ...files], { stdio: 'inherit' });
  await new Promise((resolve) => child.on('exit', resolve));
}

if (command === 'up') await up();
else if (command === 'down') await down();
else if (command === 'status') await status();
else if (command === 'logs') await logs();
else {
  console.error(`usage: node scripts/local-stack.mjs [up|down|status|logs] [--quiet]`);
  process.exit(2);
}
