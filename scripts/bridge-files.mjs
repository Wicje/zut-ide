// The bridge's file rules, kept pure so they can be unit tested.
//
// The bridge is the hand-off between the IDE and the agent: the IDE's
// project is written into the agent's workspace, the agent edits it, and
// the IDE reads it back. For the agent to review *the project you opened*
// and not the leftovers of the previous one, the workspace must be an
// exact mirror of the project — not a merge.

import { promises as fs } from 'node:fs';
import path from 'node:path';

/** Directories and files the mirror never touches. */
const KEEP = new Set(['.git', 'node_modules']);

/** Rejects paths that would escape the workspace. */
export function safePath(p) {
  const clean = path.normalize(p).replace(/\\/g, '/');
  if (clean.startsWith('/') || clean.split('/').includes('..')) return null;
  if (clean === '' || clean === '.') return null;
  return clean;
}

/** True for things the mirror leaves alone (dot files, .git, node_modules). */
export function isKept(relPath) {
  return relPath.split('/').some((part) => part.startsWith('.') || KEEP.has(part));
}

/** Every file under `dir`, as paths relative to it. */
export async function listFiles(dir, current = '') {
  const out = [];
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const rel = current ? `${current}/${e.name}` : e.name;
    if (isKept(rel)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listFiles(full, rel)));
    else if (e.isFile()) out.push(rel);
  }
  return out;
}

/**
 * The files to delete so the workspace matches the project exactly.
 * Dot files and .git are never touched.
 */
export function mirrorPlan(existing, wanted) {
  const keep = new Set(Object.keys(wanted));
  return existing.filter((p) => !keep.has(p) && !isKept(p));
}

/** Reads the workspace into a path -> content map. */
export async function readTree(dir) {
  const out = {};
  const files = await listFiles(dir);
  for (const rel of files) {
    try {
      out[rel] = await fs.readFile(path.join(dir, rel), 'utf8');
    } catch {
      /* binary/unreadable — skip */
    }
  }
  return out;
}

/**
 * Writes the project into the workspace and removes anything that is not
 * part of it, so the agent never sees a leftover from another project.
 * Returns the paths that were removed.
 */
export async function writeMirror(root, files) {
  for (const [p, content] of Object.entries(files)) {
    const target = safePath(p);
    if (!target) throw new Error(`unsafe path: ${p}`);
    const full = path.join(root, target);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, String(content), 'utf8');
  }
  const existing = await listFiles(root);
  const stale = mirrorPlan(existing, files);
  for (const rel of stale) {
    try {
      await fs.rm(path.join(root, rel), { force: true });
    } catch {
      /* leave it */
    }
  }
  // Drop directories that are now empty.
  for (const rel of stale) {
    let dir = path.dirname(path.join(root, rel));
    while (dir.startsWith(root) && dir !== root) {
      try {
        const rest = await fs.readdir(dir);
        if (rest.length) break;
        await fs.rmdir(dir);
      } catch {
        break;
      }
      dir = path.dirname(dir);
    }
  }
  return stale;
}
