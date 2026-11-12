import type { FileMap } from '../adapters/filemap';
import { K, readKey, writeKey } from './storage-keys';

export interface RecentProject {
  id: string;
  name: string;
  files: FileMap;
  fileCount: number;
  savedAt: number;
}

const MAX_PROJECTS = 6;
const MAX_PAYLOAD_BYTES = 400_000;

export function listRecents(): RecentProject[] {
  try {
    const raw = readKey(K.recentProjects);
    const arr = raw ? (JSON.parse(raw) as RecentProject[]) : [];
    if (!Array.isArray(arr)) return [];
    return arr.filter((r) => r && typeof r.name === 'string' && r.files);
  } catch {
    return [];
  }
}

/** Stash a copy of the current device project so it can be reopened later.
 *  Empty projects are skipped; entries are deduped by name, newest first. */
export function pushRecent(name: string, files: FileMap): RecentProject[] {
  const clean = name.trim() || 'Untitled project';
  const fileCount = Object.keys(files).length;
  if (fileCount === 0) return listRecents();
  const entry: RecentProject = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: clean,
    files: { ...files },
    fileCount,
    savedAt: Date.now(),
  };
  try {
    const next = [entry, ...listRecents().filter((r) => r.name !== clean)].slice(0, MAX_PROJECTS);
    while (next.length > 0 && JSON.stringify(next).length > MAX_PAYLOAD_BYTES) next.pop();
    writeKey(K.recentProjects, JSON.stringify(next));
    return next;
  } catch {
    return listRecents();
  }
}

export function removeRecent(id: string): RecentProject[] {
  const next = listRecents().filter((r) => r.id !== id);
  try {
    writeKey(K.recentProjects, JSON.stringify(next));
  } catch {
    /* quota — the list just does not persist */
  }
  return next;
}
