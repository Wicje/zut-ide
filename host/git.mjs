// Thin, allow-listed git wrapper. Never accepts a shell string or arbitrary
// flags from the browser: every operation maps to a fixed argv.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { cleanBranchName, cleanCommitMessage, isIgnoredPath, parseGitStatus, safeJoin } from './lib.mjs'

const exec = promisify(execFile)
const MAX_BUFFER = 4 * 1024 * 1024
const TIMEOUT_MS = 20_000

function gitEnv() {
  return {
    PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
    HOME: process.env.HOME ?? process.env.USERPROFILE ?? '/tmp',
    LANG: 'C.UTF-8',
    GIT_TERMINAL_PROMPT: '0',
    GIT_OPTIONAL_LOCKS: '0',
  }
}

async function run(root, args, { timeout = TIMEOUT_MS } = {}) {
  try {
    const { stdout, stderr } = await exec('git', ['-C', root, ...args], {
      cwd: root,
      timeout,
      maxBuffer: MAX_BUFFER,
      env: gitEnv(),
      windowsHide: true,
    })
    return { ok: true, stdout, stderr }
  } catch (e) {
    const stderr = String(e?.stderr ?? e?.message ?? 'git failed').trim()
    return { ok: false, error: stderr.slice(0, 4000), code: e?.code ?? null }
  }
}

export async function isGitRepo(root) {
  const r = await run(root, ['rev-parse', '--is-inside-work-tree'])
  return r.ok && r.stdout.trim() === 'true'
}

export async function status(root) {
  const r = await run(root, ['status', '--porcelain=v1', '-b', '--untracked-files=all'])
  if (!r.ok) return r
  return { ok: true, status: parseGitStatus(r.stdout) }
}

export async function diff(root, { path: relPath, staged = false } = {}) {
  const args = ['diff', '--no-color', '--no-ext-diff']
  if (staged) args.push('--cached')
  if (relPath) {
    const target = safeJoin(root, relPath)
    if (!target) return { ok: false, error: 'Unsafe path.' }
    args.push('--', relPath)
  }
  const r = await run(root, args)
  if (!r.ok) return r
  return { ok: true, diff: r.stdout.slice(0, 512 * 1024) }
}

export async function log(root, limit = 20) {
  const n = Math.max(1, Math.min(100, Number(limit) || 20))
  const r = await run(root, [
    'log',
    `-${n}`,
    '--pretty=format:%H%x09%h%x09%an%x09%aI%x09%s',
  ])
  if (!r.ok) return r
  const commits = r.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, shortSha, author, date, ...rest] = line.split('\t')
      return { sha, shortSha, author, date, message: rest.join('\t') }
    })
  return { ok: true, commits }
}

export async function branches(root) {
  const r = await run(root, ['branch', '--format=%(refname:short)%x09%(HEAD)'])
  if (!r.ok) return r
  return {
    ok: true,
    branches: r.stdout
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [name, head] = line.split('\t')
        return { name, current: head === '*' }
      }),
  }
}

export async function init(root) {
  const r = await run(root, ['init', '-b', 'main'])
  if (r.ok) return { ok: true }
  // Older git has no -b.
  return run(root, ['init'])
}

export async function commit(root, message) {
  const msg = cleanCommitMessage(message)
  if (!msg) return { ok: false, error: 'Commit message must be 1–500 characters.' }

  // Stage only paths the IDE is willing to show. `git add -A` with no pathspec
  // would also stage ignored secrets (.env*) and binary/generated files the
  // workspace sync deliberately keeps out of the editor.
  const current = await status(root)
  if (!current.ok) return current
  const paths = current.status.files.map((file) => file.path).filter((p) => p && !isIgnoredPath(p))
  if (paths.length === 0) return { ok: false, error: 'Nothing to commit — no visible changes.' }

  for (let i = 0; i < paths.length; i += 400) {
    const add = await run(root, ['add', '-A', '--', ...paths.slice(i, i + 400)])
    if (!add.ok) return add
  }
  const r = await run(root, ['commit', '-m', msg])
  if (!r.ok) return r
  const head = await run(root, ['rev-parse', '--short', 'HEAD'])
  return { ok: true, sha: head.ok ? head.stdout.trim() : null, summary: r.stdout.trim().split('\n')[0] }
}

export async function checkout(root, name, create = false) {
  const branch = cleanBranchName(name)
  if (!branch) return { ok: false, error: 'Invalid branch name.' }
  const args = create ? ['checkout', '-b', branch] : ['checkout', branch]
  const r = await run(root, args)
  if (!r.ok) return r
  return { ok: true, branch }
}
