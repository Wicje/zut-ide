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

import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATE = path.join(ROOT, '.zut-local');
const LOGS = path.join(STATE, 'logs');
const PIDS = path.join(STATE, 'pids.json');
// Two workspaces on purpose:
//   agent/ — a scratch copy of the project the IDE has open. The bridge
//            mirrors it exactly, so the agent never sees leftovers.
//   host/  — the real workspace with git and a real terminal.
const PROJECTS = path.resolve(
  process.env.ZUT_PROJECTS_ROOT ?? path.join(os.homedir(), '.zut-projects'),
);
const WORKSPACE = path.join(PROJECTS, 'agent');
const HOST_WORKSPACE = path.join(PROJECTS, 'host');

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
    env: { ZUT_WORKSPACE: HOST_WORKSPACE, PORT: '8790', ZUT_HOST_MODE: 'selfhost' },
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

function startService(service, { detached = true, unref = detached } = {}) {
  mkdirSync(LOGS, { recursive: true });
  const logPath = path.join(LOGS, `${service.name}.log`);
  const fd = openSync(logPath, 'a');
  const child = spawn(service.cmd, service.args, {
    cwd: service.cwd ?? ROOT,
    env: { ...process.env, ...(service.env ?? {}) },
    detached,
    stdio: ['ignore', fd, fd],
  });
  if (unref) child.unref();
  return { child, pid: child.pid, log: logPath };
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
  mkdirSync(HOST_WORKSPACE, { recursive: true });
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
  console.log(`  agent dir ${WORKSPACE}`);
  console.log(`  host dir  ${HOST_WORKSPACE}`);
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

/** True when the systemd user service is running the stack. */
function supervisedBySystemd() {
  try {
    const state = execFileSync('systemctl', ['--user', 'is-active', 'zut-local-stack.service'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return state === 'active';
  } catch {
    return false;
  }
}

/**
 * Foreground supervisor: starts every service, restarts it when it dies and
 * stops them all on SIGTERM. This is what systemd runs, so the IDE and the
 * local agent are up at login without anyone typing a command.
 */
async function serve() {
  if (process.env.CI) {
    console.error('[local] refused to serve in CI');
    return;
  }
  mkdirSync(WORKSPACE, { recursive: true });
  mkdirSync(HOST_WORKSPACE, { recursive: true });
  mkdirSync(LOGS, { recursive: true });

  const children = new Map();
  const pids = readPids();
  let stopping = false;

  const kill = (pid) => {
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        /* already gone */
      }
    }
  };

  const spawnService = (service) => {
    // Not unref'd: the supervisor stays alive as long as its children run.
    const { child, pid, log } = startService(service, { detached: true, unref: false });
    children.set(service.name, { pid, log });
    pids[service.name] = { pid, port: service.port, log };
    child.on('exit', (code, signal) => {
      if (stopping) return;
      console.log(`[local] ${service.name} exited (code ${code}, signal ${signal}) — restarting in 2s`);
      setTimeout(() => {
        if (!stopping) spawnService(service);
      }, 2000);
    });
    console.log(`[local] ${service.name}: started (pid ${pid}) — ${log}`);
  };

  // Services first, the dev server last: the IDE is only useful once the
  // agent behind it is answering.
  for (const service of SERVICES.filter((s) => s.name !== 'vite')) {
    if (await portOpen(service.port)) {
      console.log(`[local] ${service.name}: already up on :${service.port} — leaving it alone`);
      continue;
    }
    spawnService(service);
  }

  const vite = SERVICES.find((s) => s.name === 'vite');
  if (vite) {
    if (await portOpen(vite.port)) {
      console.log(`[local] vite: already up on :${vite.port} — leaving it alone`);
    } else {
      // The Vite plugin would try to start a second stack; we are the stack.
      spawnService({ ...vite, env: { ...(vite.env ?? {}), ZUT_LOCAL_STACK: '0' } });
    }
  }

  writePids(pids);
  console.log('');
  console.log('  browser   http://127.0.0.1:5173/');
  console.log('  terminal  npm run term -- --url http://127.0.0.1:5173/');
  console.log(`  agent dir ${WORKSPACE}`);
  console.log(`  host dir  ${HOST_WORKSPACE}`);

  const stop = () => {
    if (stopping) return;
    stopping = true;
    console.log('[local] stopping');
    for (const { pid } of children.values()) kill(pid);
    setTimeout(() => process.exit(0), 1500);
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

async function down() {
  // The systemd service supervises the stack — stopping the children would
  // just make it restart them. Stop the service instead.
  if (supervisedBySystemd()) {
    try {
      execFileSync('systemctl', ['--user', 'stop', 'zut-local-stack.service'], { encoding: 'utf8' });
    } catch {
      /* fall through to the pid cleanup below */
    }
    console.log('[local] stopped the systemd service (it will start again at login)');
  }

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
else if (command === 'serve') await serve();
else if (command === 'down') await down();
else if (command === 'status') await status();
else if (command === 'logs') await logs();
else {
  console.error(`usage: node scripts/local-stack.mjs [up|serve|down|status|logs] [--quiet]`);
  process.exit(2);
}
