// Pure helpers for `zut host`. Kept dependency-free so they can be tested
// without a workspace, git, or a pty.

import path from 'node:path'

export const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '.output',
  '.vercel',
  '.netlify',
  'coverage',
  '.cache',
  '.turbo',
  '.parcel-cache',
  'vendor',
  '__pycache__',
  '.venv',
  'venv',
  'target',
  '.idea',
  '.DS_Store',
])

export const IGNORED_FILES = new Set(['.DS_Store', 'Thumbs.db'])

const TEXT_EXTENSIONS = new Set([
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts',
  '.json', '.jsonc', '.json5', '.css', '.scss', '.sass', '.less',
  '.html', '.htm', '.svg', '.xml', '.txt', '.md', '.mdx', '.rst',
  '.yml', '.yaml', '.toml', '.ini', '.cfg', '.conf', '.env',
  '.py', '.rb', '.go', '.rs', '.java', '.c', '.h', '.cc', '.cpp', '.hpp',
  '.cs', '.php', '.sh', '.bash', '.zsh', '.fish', '.ps1', '.sql',
  '.graphql', '.gql', '.prisma', '.vue', '.svelte', '.astro',
  '.gitignore', '.gitattributes', '.editorconfig', '.prettierrc', '.eslintrc',
])

const TEXT_NAMES = new Set([
  'Dockerfile', 'Makefile', 'Procfile', 'Gemfile', 'Rakefile', 'LICENSE', 'README', 'CHANGELOG',
])

export function isIgnoredPath(relPath) {
  const parts = String(relPath).replace(/\\/g, '/').split('/')
  if (parts.some((p) => IGNORED_DIRS.has(p))) return true
  const base = parts[parts.length - 1]
  if (IGNORED_FILES.has(base)) return true
  if (base.startsWith('.env')) return true
  if (/\.(png|jpe?g|gif|webp|ico|bmp|avif|tiff|woff2?|ttf|otf|eot|mp[34]|webm|mov|avi|pdf|zip|gz|tar|tgz|7z|rar|exe|dll|so|dylib|bin|wasm|class|jar|pyc|o|a)$/i.test(base)) {
    return true
  }
  return false
}

export function isTextPath(relPath) {
  const base = path.posix.basename(String(relPath).replace(/\\/g, '/'))
  if (TEXT_NAMES.has(base)) return true
  const ext = path.posix.extname(base).toLowerCase()
  if (TEXT_EXTENSIONS.has(ext)) return true
  return !ext
}

/** Resolve a workspace-relative path, or null when it escapes the root. */
export function safeJoin(root, relPath) {
  if (typeof relPath !== 'string' || relPath === '' || relPath.includes('\0')) return null
  const slashed = relPath.replace(/\\/g, '/')
  if (slashed.startsWith('/') || slashed.startsWith('//') || /^[A-Za-z]:/.test(slashed)) return null
  const clean = path.posix.normalize(slashed)
  if (clean === '' || clean === '.' || clean === '..' || clean.startsWith('../')) return null
  if (clean.split('/').includes('..')) return null
  const resolved = path.resolve(root, clean)
  const base = path.resolve(root)
  if (resolved !== base && !resolved.startsWith(base + path.sep)) return null
  return resolved
}

function unquoteGitPath(value) {
  let p = value.trim()
  if (p.startsWith('"') && p.endsWith('"')) {
    p = p.slice(1, -1)
    try {
      p = JSON.parse(`"${p.replace(/\\"/g, '\\"')}"`)
    } catch {
      /* keep the raw value */
    }
  }
  return p
}

/**
 * Parse `git status --porcelain=v1 -b` into a serialisable shape.
 * Renames report the new path (the tab-separated source is dropped).
 */
export function parseGitStatus(text) {
  const out = { branch: null, upstream: null, ahead: 0, behind: 0, files: [] }
  for (const line of String(text).split('\n')) {
    if (!line) continue
    if (line.startsWith('## ')) {
      const body = line.slice(3)
      const noCommits = body.match(/^No commits yet on (.+)$/)
      if (noCommits) {
        out.branch = noCommits[1]
        continue
      }
      const b = body.match(/^(.+?)(?:\.\.\.(\S+))?(?: \[(.+)\])?$/)
      if (b) {
        out.branch = b[1]
        out.upstream = b[2] ?? null
        if (b[3]) {
          const ahead = b[3].match(/ahead (\d+)/)
          const behind = b[3].match(/behind (\d+)/)
          if (ahead) out.ahead = Number(ahead[1])
          if (behind) out.behind = Number(behind[1])
        }
      }
      continue
    }
    const index = line[0]
    const worktree = line[1]
    let rest = line.slice(3)
    if (rest.includes(' -> ')) rest = rest.split(' -> ').pop()
    out.files.push({
      path: unquoteGitPath(rest),
      index: index === ' ' ? '' : index,
      worktree: worktree === ' ' ? '' : worktree,
      untracked: index === '?' && worktree === '?',
    })
  }
  return out
}

export function cleanCommitMessage(value) {
  if (typeof value !== 'string') return null
  const msg = value.replace(/\0/g, '').trim()
  if (!msg || msg.length > 500) return null
  return msg
}

export function cleanBranchName(value) {
  if (typeof value !== 'string') return null
  const name = value.trim()
  if (!name || name.length > 120) return null
  if (!/^[A-Za-z0-9._/-]+$/.test(name)) return null
  if (name.startsWith('-') || name.startsWith('/') || name.endsWith('/') || name.includes('..')) return null
  if (name.endsWith('.lock')) return null
  return name
}

export function clampInt(value, fallback, min, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.floor(n)))
}
