import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { commit, init, status } from './git.mjs'

const exec = promisify(execFile)
let root

async function git(args) {
  const { stdout } = await exec('git', ['-C', root, ...args], { env: process.env })
  return stdout
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'zut-host-git-'))
  await init(root)
  await git(['config', 'user.email', 'test@example.com'])
  await git(['config', 'user.name', 'Zut Test'])
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe('host git commit', () => {
  it('stages visible changes but never ignored secrets', async () => {
    await fs.writeFile(path.join(root, 'app.ts'), 'export const x = 1\n')
    await fs.writeFile(path.join(root, '.env'), 'SECRET=1\n')

    const result = await commit(root, 'feat: initial')
    expect(result.ok).toBe(true)

    const committed = await git(['show', '--name-only', '--pretty=format:'])
    expect(committed.split('\n').filter(Boolean)).toEqual(['app.ts'])

    // The secret stays on disk, untracked, not silently deleted.
    expect(await fs.readFile(path.join(root, '.env'), 'utf8')).toBe('SECRET=1\n')
    const after = await status(root)
    expect(after.status.files.map((f) => f.path)).toContain('.env')
  })

  it('stages deletions of visible files', async () => {
    await fs.writeFile(path.join(root, 'app.ts'), 'x\n')
    await commit(root, 'feat: add')
    await fs.unlink(path.join(root, 'app.ts'))

    const result = await commit(root, 'fix: remove')
    expect(result.ok).toBe(true)
    expect((await git(['ls-files'])).trim()).toBe('')
  })
})
