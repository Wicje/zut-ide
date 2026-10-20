import { describe, expect, it } from 'vitest'
import {
  cleanBranchName,
  cleanCommitMessage,
  isIgnoredPath,
  isTextPath,
  parseGitStatus,
  safeJoin,
} from './lib.mjs'

describe('host path safety', () => {
  it('confines paths to the workspace', () => {
    const root = '/work'
    expect(safeJoin(root, 'src/app.ts')).toBe('/work/src/app.ts')
    expect(safeJoin(root, './src/../src/app.ts')).toBe('/work/src/app.ts')
    expect(safeJoin(root, '../etc/passwd')).toBeNull()
    expect(safeJoin(root, '/etc/passwd')).toBeNull()
    expect(safeJoin(root, 'C:/Windows')).toBeNull()
    expect(safeJoin(root, 'a\0b')).toBeNull()
    expect(safeJoin(root, '')).toBeNull()
  })

  it('ignores generated and secret paths', () => {
    expect(isIgnoredPath('node_modules/react/index.js')).toBe(true)
    expect(isIgnoredPath('.git/config')).toBe(true)
    expect(isIgnoredPath('.env.local')).toBe(true)
    expect(isIgnoredPath('src/index.ts')).toBe(false)
  })

  it('treats extensionless files as text but binaries as not', () => {
    expect(isTextPath('README')).toBe(true)
    expect(isTextPath('Dockerfile')).toBe(true)
    expect(isTextPath('src/app.tsx')).toBe(true)
    expect(isTextPath('photo.png')).toBe(false)
    expect(isTextPath('font.woff2')).toBe(false)
  })
})

describe('git parsing', () => {
  it('parses a branch with ahead/behind and files', () => {
    const out = parseGitStatus(
      '## main...origin/main [ahead 2, behind 1]\n M src/app.ts\n?? notes.md\nA  new.ts\n',
    )
    expect(out.branch).toBe('main')
    expect(out.upstream).toBe('origin/main')
    expect(out.ahead).toBe(2)
    expect(out.behind).toBe(1)
    expect(out.files).toEqual([
      { path: 'src/app.ts', index: '', worktree: 'M', untracked: false },
      { path: 'notes.md', index: '?', worktree: '?', untracked: true },
      { path: 'new.ts', index: 'A', worktree: '', untracked: false },
    ])
  })

  it('handles no-commits and renames', () => {
    expect(parseGitStatus('## No commits yet on main\n').branch).toBe('main')
    const renamed = parseGitStatus('R  old.ts -> new.ts\n')
    expect(renamed.files[0]).toMatchObject({ path: 'new.ts', index: 'R' })
  })

  it('validates commit messages and branch names', () => {
    expect(cleanCommitMessage('  feat: add host  ')).toBe('feat: add host')
    expect(cleanCommitMessage('   ')).toBeNull()
    expect(cleanCommitMessage('x'.repeat(501))).toBeNull()
    expect(cleanBranchName('feat/terminal')).toBe('feat/terminal')
    expect(cleanBranchName('-bad')).toBeNull()
    expect(cleanBranchName('a..b')).toBeNull()
    expect(cleanBranchName('bad branch')).toBeNull()
  })
})
