// Serves the Zut app for the terminal client and finds the pieces the
// launcher needs. Everything here runs in plain Node — outside the pixel
// runtime — so the terminal is still usable while the app boots.

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TermOptions } from './options.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function findRepoRoot(from: string): string {
  let dir = from;
  for (let i = 0; i < 6; i++) {
    const pkg = path.join(dir, 'package.json');
    if (existsSync(pkg)) {
      try {
        const name = (JSON.parse(readFileSync(pkg, 'utf8')) as { name?: string }).name;
        if (name === 'zut') return dir;
      } catch {
        /* keep walking */
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('Could not find the zut repository root.');
}

/** `<repo>/terminal` */
export const TERMINAL_DIR = path.resolve(HERE, '..');
/** `<repo>` */
export const REPO_ROOT = findRepoRoot(TERMINAL_DIR);

export function appServerUrl(port: number): string {
  return `http://127.0.0.1:${port}/`;
}

function npmCmd(): string {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function run(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code ?? 'null'}.`));
    });
  });
}

export async function isServing(url: string, timeoutMs = 1200): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.status < 500;
  } catch {
    return false;
  }
}

async function waitForHttp(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isServing(url)) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

export interface AppServer {
  url: string;
  /** True when we started it and are therefore responsible for killing it. */
  owned: boolean;
  stop(): void;
}

export interface EnsureOptions {
  /** Rebuild the app before serving. */
  rebuild: boolean;
  /** How to serve it. */
  mode: 'preview' | 'dev';
  port: number;
  /** Sink for progress lines. */
  log(message: string): void;
}

/** Builds the app so `dist/` is fresh enough to serve. */
export async function buildApp(log: (message: string) => void): Promise<void> {
  log('zut: building the app (this takes a moment)…');
  await run(npmCmd(), ['run', 'build'], REPO_ROOT);
}

/** Newest mtime under a directory tree (0 when it does not exist). */
function newestMtime(dir: string): number {
  let newest = 0;
  const walk = (current: string) => {
    let entries: import('node:fs').Dirent[];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else {
        try {
          newest = Math.max(newest, statSync(full).mtimeMs);
        } catch {
          /* skip */
        }
      }
    }
  };
  walk(dir);
  return newest;
}

/**
 * True when the built app is older than the sources. Serving a stale build
 * means the terminal shows an IDE that no longer matches the repo.
 */
export function isDistStale(): boolean {
  const distEntry = path.join(REPO_ROOT, 'dist', 'index.html');
  if (!existsSync(distEntry)) return true;
  try {
    return newestMtime(path.join(REPO_ROOT, 'src')) > statSync(distEntry).mtimeMs;
  } catch {
    return false;
  }
}

/**
 * Makes sure the Zut app is reachable and returns how to reach it.
 * An already-running server on the port is reused rather than duplicated.
 */
export async function ensureAppServer(opts: EnsureOptions): Promise<AppServer> {
  const url = appServerUrl(opts.port);

  if (await isServing(url)) {
    opts.log(`zut: reusing the app server already on ${url}`);
    return { url, owned: false, stop() {} };
  }

  const distEntry = path.join(REPO_ROOT, 'dist', 'index.html');
  if (opts.mode === 'preview' && (opts.rebuild || !existsSync(distEntry) || isDistStale())) {
    await buildApp(opts.log);
  }

  const vite = path.join(REPO_ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!existsSync(vite)) {
    throw new Error('Vite is missing — run `npm install` in the repository root first.');
  }

  const args =
    opts.mode === 'preview'
      ? ['preview', '--port', String(opts.port), '--strictPort', '--host', '127.0.0.1']
      : ['--port', String(opts.port), '--strictPort', '--host', '127.0.0.1'];

  const child: ChildProcess = spawn(process.execPath, [vite, ...args], {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
    if (stderr.length > 4000) stderr = stderr.slice(-4000);
  });

  const stop = () => {
    if (!child.killed) child.kill('SIGTERM');
  };

  if (!(await waitForHttp(url, 40000))) {
    stop();
    const detail = stderr.trim().split('\n').slice(-4).join('\n');
    throw new Error(
      `The app server did not come up at ${url}.` + (detail ? `\n${detail}` : ''),
    );
  }

  opts.log(`zut: serving ${url}`);
  return { url, owned: true, stop };
}

/** Absolute path to the pixel CLI entry (works on every platform). */
export function pixelEntry(): string {
  return path.join(TERMINAL_DIR, 'node_modules', '@zenbu-labs', 'pixel', 'dist', 'bin.js');
}

/** The built pixel app entry (package.json "main"). */
export function pixelAppEntry(): string {
  return path.join(TERMINAL_DIR, 'dist', 'main.js');
}
