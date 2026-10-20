// Workspace file IO for `zut host`: the browser FileMap is the source of
// truth, so we can read/write plain text files and never touch binaries.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { isIgnoredPath, isTextPath, safeJoin } from './lib.mjs'

export const MAX_FILES = 4000
export const MAX_FILE_BYTES = 512 * 1024
export const MAX_TOTAL_BYTES = 24 * 1024 * 1024

async function realInside(root, target) {
  const base = await fs.realpath(root)
  const parent = await fs.realpath(path.dirname(target)).catch(() => null)
  if (!parent) return false
  if (parent !== base && !parent.startsWith(base + path.sep)) return false
  try {
    const stat = await fs.lstat(target)
    if (stat.isSymbolicLink()) return false
  } catch {
    /* target does not exist yet */
  }
  return true
}

/**
 * Cheap change fingerprint: path + size + mtime for every visible entry.
 * Used by the IDE to notice edits made on the host (git pull, another editor)
 * without shipping full file contents on every poll.
 */
export async function workspaceStamp(root) {
  const rows = []

  async function walk(dir, prefix) {
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      if (isIgnoredPath(rel)) continue
      if (entry.isSymbolicLink()) {
        rows.push(`${rel}:symlink`)
        continue
      }
      if (entry.isDirectory()) {
        await walk(path.join(dir, entry.name), rel)
        continue
      }
      if (!entry.isFile()) continue
      try {
        const stat = await fs.stat(path.join(dir, entry.name))
        rows.push(`${rel}:${stat.size}:${Math.round(stat.mtimeMs)}`)
      } catch {
        rows.push(`${rel}:unreadable`)
      }
    }
  }

  await walk(root, '')
  rows.sort()
  return rows.join('\n')
}

export async function readWorkspace(root, limits = {}) {
  const maxFiles = limits.maxFiles ?? MAX_FILES
  const maxFileBytes = limits.maxFileBytes ?? MAX_FILE_BYTES
  const maxTotalBytes = limits.maxTotalBytes ?? MAX_TOTAL_BYTES
  const files = {}
  const skipped = []
  let bytes = 0

  async function walk(dir, prefix) {
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name
      if (isIgnoredPath(rel)) continue
      if (Object.keys(files).length >= maxFiles) {
        skipped.push(`${rel} (file limit)`)
        return
      }
      if (entry.isSymbolicLink()) {
        skipped.push(`${rel} (symlink)`)
        continue
      }
      if (entry.isDirectory()) {
        await walk(path.join(dir, entry.name), rel)
        continue
      }
      if (!entry.isFile() || !isTextPath(rel)) {
        skipped.push(`${rel} (binary)`)
        continue
      }
      try {
        const full = path.join(dir, entry.name)
        const stat = await fs.stat(full)
        if (stat.size > maxFileBytes) {
          skipped.push(`${rel} (>${Math.round(maxFileBytes / 1024)}KB)`)
          continue
        }
        if (bytes + stat.size > maxTotalBytes) {
          skipped.push(`${rel} (workspace size limit)`)
          continue
        }
        const text = await fs.readFile(full, 'utf8')
        bytes += Buffer.byteLength(text)
        files[rel] = text
      } catch {
        skipped.push(`${rel} (unreadable)`)
      }
    }
  }

  await walk(root, '')
  return { files, skipped, bytes, stamp: await workspaceStamp(root) }
}

export async function writeWorkspace(root, incoming, deletes = [], limits = {}) {
  const maxFiles = limits.maxFiles ?? MAX_FILES
  const maxFileBytes = limits.maxFileBytes ?? MAX_FILE_BYTES
  const maxTotalBytes = limits.maxTotalBytes ?? MAX_TOTAL_BYTES
  const entries = Object.entries(incoming ?? {})
  if (entries.length > maxFiles) throw new Error(`Too many files (${entries.length} > ${maxFiles}).`)

  let total = 0
  const planned = []
  for (const [rel, content] of entries) {
    if (typeof content !== 'string') throw new Error(`Bad content for ${rel}.`)
    if (isIgnoredPath(rel)) continue
    const target = safeJoin(root, rel)
    if (!target) throw new Error(`Unsafe path: ${rel}`)
    const size = Buffer.byteLength(content)
    if (size > maxFileBytes) throw new Error(`${rel} is larger than ${Math.round(maxFileBytes / 1024)}KB.`)
    total += size
    if (total > maxTotalBytes) throw new Error('Workspace write is too large.')
    planned.push([rel, target, content])
  }

  let written = 0
  for (const [rel, target, content] of planned) {
    await fs.mkdir(path.dirname(target), { recursive: true })
    if (!(await realInside(root, target))) throw new Error(`Refusing to write through a symlink: ${rel}`)
    await fs.writeFile(target, content, 'utf8')
    written += 1
  }

  let removed = 0
  for (const rel of Array.isArray(deletes) ? deletes : []) {
    const target = safeJoin(root, rel)
    if (!target) continue
    if (!(await realInside(root, target))) continue
    try {
      await fs.unlink(target)
      removed += 1
    } catch {
      /* already gone */
    }
  }

  return { written, removed, stamp: await workspaceStamp(root) }
}

export async function ensureWorkspace(root) {
  await fs.mkdir(root, { recursive: true })
  return root
}
