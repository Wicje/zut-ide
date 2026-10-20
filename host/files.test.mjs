import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readWorkspace, writeWorkspace } from './files.mjs'

let root

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'zut-host-files-'))
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe('host workspace files', () => {
  it('writes and reads text files', async () => {
    const result = await writeWorkspace(root, {
      'index.html': '<h1>hi</h1>',
      'src/app.ts': 'export const x = 1\n',
      '.env': 'SECRET=1',
      'logo.png': 'not really',
    })
    expect(result.written).toBe(2)
    const tree = await readWorkspace(root)
    expect(tree.files).toEqual({
      'index.html': '<h1>hi</h1>',
      'src/app.ts': 'export const x = 1\n',
    })
    await expect(fs.stat(path.join(root, '.env'))).rejects.toThrow()
  })

  it('rejects traversal and unsafe targets', async () => {
    await expect(writeWorkspace(root, { '../escape.ts': 'x' })).rejects.toThrow(/Unsafe path/)
    await expect(writeWorkspace(root, { '/etc/passwd': 'x' })).rejects.toThrow(/Unsafe path/)
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'zut-outside-'))
    await fs.symlink(outside, path.join(root, 'link')).catch(() => {})
    if ((await fs.lstat(path.join(root, 'link')).catch(() => null))?.isSymbolicLink()) {
      await expect(writeWorkspace(root, { 'link/pwn.ts': 'x' })).rejects.toThrow(/symlink/)
    }
    await fs.rm(outside, { recursive: true, force: true })
  })

  it('removes files and never escapes on delete', async () => {
    await writeWorkspace(root, { 'a.ts': '1', 'b.ts': '2' })
    const outside = path.join(os.tmpdir(), `zut-delete-${Date.now()}.txt`)
    await fs.writeFile(outside, 'keep')
    const result = await writeWorkspace(root, {}, ['a.ts', '../nope', outside])
    expect(result.removed).toBe(1)
    await expect(fs.stat(path.join(root, 'a.ts'))).rejects.toThrow()
    expect(await fs.readFile(outside, 'utf8')).toBe('keep')
    await fs.rm(outside, { force: true })
  })

  it('enforces per-file and total limits', async () => {
    await expect(
      writeWorkspace(root, { 'big.ts': 'x'.repeat(20) }, [], { maxFileBytes: 10 }),
    ).rejects.toThrow(/larger than/)
    await expect(
      writeWorkspace(root, { 'a.ts': '123456', 'b.ts': '123456' }, [], { maxTotalBytes: 10 }),
    ).rejects.toThrow(/too large/)
  })
})
