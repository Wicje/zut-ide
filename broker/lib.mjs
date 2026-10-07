// broker/lib.mjs — pure helpers shared by the broker server + tests.
// No I/O here except through injected stores; no secrets.

export function safeSeg(s, fallback = 'default') {
  const v = String(s ?? fallback)
  return /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null
}

/** Guard a project-relative path (no absolutes, no .., no NUL). */
export function cleanRelPath(p) {
  const clean = String(p).replace(/\\/g, '/')
  const norm = clean.split('/').filter((s) => s && s !== '.')
  if (clean.startsWith('/') || norm.includes('..') || norm.length === 0) return null
  if (clean.includes('\0')) return null
  return norm.join('/')
}

/** djb2 hash — change detection only, never auth. */
export function hashFile(content) {
  let h = 5381
  const s = String(content ?? '')
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/** Split entries into batches of ≤batchSize for file-write endpoints. */
export function batchEntries(entries, batchSize = 200) {
  const out = []
  for (let i = 0; i < entries.length; i += batchSize) out.push(entries.slice(i, i + batchSize))
  return out.length ? out : [[]]
}

/** Files changed since last sync (hash diff). Never syncs lockfiles' noise
 *  back — caller decides write-back policy (explicit accept in UI). */
export function diffFiles(files, hashes) {
  const changed = []
  for (const [p, content] of Object.entries(files ?? {})) {
    if (p === 'index.html') continue
    if (hashFile(content) !== hashes[p]) changed.push(p)
  }
  return changed
}

export function dailyKey(uid, d = new Date()) {
  return `${uid}:${d.toISOString().slice(0, 10)}`
}

/** Rough Small-hours estimate for display; Cells usage endpoint bills exact. */
export function estimateSmallHours(durationMs, size = 'small') {
  const factor = size === 'micro' ? 0.5 : size === 'standard' ? 2 : 1
  return (durationMs / 3600000) * factor
}
