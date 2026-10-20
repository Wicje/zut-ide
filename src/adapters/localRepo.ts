// Local repositories in the browser (File System Access API).
//
// Chrome/Edge/ChromeOS only. The user picks a folder; we read it into the
// same FileMap the rest of the IDE uses, write edits back to disk, and keep
// the directory handle in IndexedDB so a reload can reconnect.
//
// Browsers without the API (Safari, most mobile Chrome) fall back to the
// device draft / host workspace. Callers must check isLocalRepoSupported().
import type { FileMap } from './filemap';

export type WorkspaceSourceKind = 'device' | 'local' | 'cloud' | 'host';

export interface LocalRepo {
  root: FileSystemDirectoryHandle;
  name: string;
}

export interface LocalTree {
  files: FileMap;
  skipped: string[];
  bytes: number;
}

export interface LocalTreeDiff {
  updated: Record<string, string>;
  created: Record<string, string>;
  deleted: string[];
}

const MAX_FILES = 4000;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_TOTAL_BYTES = 24 * 1024 * 1024;

/** Directories that are never worth reading into an editor. */
const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.output',
  '.cache',
  '.turbo',
  '.parcel-cache',
  'coverage',
  'vendor',
  '.venv',
  'venv',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.idea',
  '.vscode',
  '.DS_Store',
  'target',
  'Pods',
]);

/** Extensions we always treat as text. Unknown extensions are sniffed. */
const TEXT_EXTENSIONS = new Set([
  'html', 'htm', 'css', 'scss', 'sass', 'less', 'js', 'jsx', 'mjs', 'cjs',
  'ts', 'tsx', 'mts', 'cts', 'json', 'jsonc', 'md', 'mdx', 'txt', 'yml',
  'yaml', 'toml', 'ini', 'env', 'sh', 'bash', 'zsh', 'fish', 'py', 'pyi',
  'go', 'rs', 'rb', 'php', 'java', 'kt', 'kts', 'c', 'h', 'cc', 'cpp',
  'hpp', 'cs', 'swift', 'sql', 'graphql', 'gql', 'xml', 'svg', 'vue',
  'svelte', 'astro', 'dockerfile', 'gitignore', 'editorconfig', 'lock',
  'conf', 'config', 'properties', 'gradle', 'makefile', 'cmake', 'proto',
]);

/** Filenames (no extension) that are still text/code. */
const TEXT_NAMES = new Set([
  'Makefile', 'Dockerfile', 'Procfile', 'LICENSE', 'README', 'CHANGELOG',
  'Cargo.toml', 'Cargo.lock', 'go.mod', 'go.sum', 'Gemfile', 'Rakefile',
  'Justfile', 'Vagrantfile', 'CODEOWNERS', '.gitignore', '.dockerignore',
  '.editorconfig', '.npmrc', '.nvmrc', '.prettierrc', '.eslintrc', '.env',
]);

interface DirectoryPickerOptions {
  id?: string;
  mode?: 'read' | 'readwrite';
  startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos';
}

type PermissionMode = 'read' | 'readwrite';

interface PermissionCapable {
  queryPermission?(descriptor: { mode: PermissionMode }): Promise<PermissionState>;
  requestPermission?(descriptor: { mode: PermissionMode }): Promise<PermissionState>;
}

declare global {
  interface Window {
    showDirectoryPicker?: (options?: DirectoryPickerOptions) => Promise<FileSystemDirectoryHandle>;
  }
}

export function isLocalRepoSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

/** Pure: true when any path segment is a heavy/generated directory. */
export function shouldIgnorePath(path: string): boolean {
  const parts = path.split('/').filter(Boolean);
  if (parts.some((p) => IGNORED_DIRS.has(p))) return true;
  // Secrets never enter a draft, the AI context, or any sync path.
  const base = parts[parts.length - 1] ?? '';
  return /^\.env(\.|$)/i.test(base);
}

/** Pure: obvious text/code extension, or a known extension-less text file. */
export function isTextPath(path: string): boolean {
  const name = path.split('/').pop() ?? path;
  if (TEXT_NAMES.has(name)) return true;
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return false;
  return TEXT_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

/** Pure: canonicalise a repo-relative path; null when it could escape. */
export function sanitizeRepoPath(value: string): string | null {
  if (typeof value !== 'string' || value === '' || value.includes('\0')) return null;
  const slashed = value.replace(/\\/g, '/');
  if (slashed.startsWith('/') || slashed.startsWith('//') || /^[A-Za-z]:/.test(slashed)) return null;
  const parts: string[] = [];
  for (const seg of slashed.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') return null;
    parts.push(seg);
  }
  return parts.length ? parts.join('/') : null;
}

/** Pure: what changed between two snapshots (used for disk sync). */
export function diffFileMaps(prev: FileMap, next: FileMap): LocalTreeDiff {
  const updated: Record<string, string> = {};
  const created: Record<string, string> = {};
  const deleted: string[] = [];
  for (const [path, content] of Object.entries(next)) {
    const before = prev[path];
    if (before === undefined) created[path] = content;
    else if (before !== content) updated[path] = content;
  }
  for (const path of Object.keys(prev)) {
    if (!(path in next)) deleted.push(path);
  }
  return { updated, created, deleted };
}

/** True only when permission is already granted (never prompts). */
export async function hasPermission(
  handle: FileSystemDirectoryHandle,
  mode: PermissionMode = 'readwrite',
): Promise<boolean> {
  const h = handle as FileSystemDirectoryHandle & PermissionCapable;
  const query = h.queryPermission;
  if (typeof query !== 'function') return false;
  try {
    return (await query.call(h, { mode })) === 'granted';
  } catch {
    return false;
  }
}

/** Ask for (or reuse) read/write permission on a directory handle. */
export async function ensurePermission(
  handle: FileSystemDirectoryHandle,
  mode: PermissionMode = 'readwrite',
): Promise<boolean> {
  const h = handle as FileSystemDirectoryHandle & PermissionCapable;
  const query = h.queryPermission;
  const request = h.requestPermission;
  try {
    if (typeof query === 'function' && (await query.call(h, { mode })) === 'granted') return true;
    if (typeof request === 'function' && (await request.call(h, { mode })) === 'granted') return true;
  } catch {
    return false;
  }
  // Older implementations may not expose permission methods at all.
  return typeof query !== 'function' && typeof request !== 'function';
}

/** Show the folder picker. Returns null when the user cancels. */
export async function pickLocalRepo(): Promise<LocalRepo | null> {
  if (!isLocalRepoSupported()) {
    throw new Error('Opening local folders needs Chrome, Edge, or ChromeOS. Use the host workspace on this browser.');
  }
  try {
    const root = await window.showDirectoryPicker!({ id: 'zut-workspace', mode: 'readwrite' });
    return { root, name: root.name };
  } catch (e) {
    if ((e as DOMException)?.name === 'AbortError') return null;
    throw e;
  }
}

function looksBinary(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, 8000);
  for (let i = 0; i < n; i += 1) if (bytes[i] === 0) return true;
  return false;
}

async function readFileText(handle: FileSystemFileHandle, sizeLimit: number): Promise<string | null> {
  const file = await handle.getFile();
  if (file.size > sizeLimit) return null;
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (looksBinary(bytes)) return null;
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

/**
 * Recursively read a directory into a FileMap. Heavy/generated directories are
 * skipped; binaries and oversized files are reported in `skipped` rather than
 * silently dropped.
 */
export async function readLocalTree(root: FileSystemDirectoryHandle): Promise<LocalTree> {
  const files: FileMap = {};
  const skipped: string[] = [];
  let bytes = 0;

  async function walk(dir: FileSystemDirectoryHandle, prefix: string): Promise<void> {
    for await (const [name, child] of (dir as unknown as {
      entries(): AsyncIterableIterator<[string, FileSystemDirectoryHandle | FileSystemFileHandle]>;
    }).entries()) {
      if (Object.keys(files).length >= MAX_FILES) {
        skipped.push(`${prefix}${name} (file limit)`);
        return;
      }
      const path = prefix ? `${prefix}/${name}` : name;
      if (shouldIgnorePath(path)) continue;
      if (child.kind === 'directory') {
        await walk(child as FileSystemDirectoryHandle, path);
        continue;
      }
      if (!isTextPath(path)) {
        skipped.push(`${path} (binary)`);
        continue;
      }
      try {
        const text = await readFileText(child as FileSystemFileHandle, MAX_FILE_BYTES);
        if (text === null) {
          skipped.push(`${path} (binary or >${Math.round(MAX_FILE_BYTES / 1024)}KB)`);
          continue;
        }
        if (bytes + text.length > MAX_TOTAL_BYTES) {
          skipped.push(`${path} (workspace size limit)`);
          continue;
        }
        bytes += text.length;
        files[path] = text;
      } catch {
        skipped.push(`${path} (unreadable)`);
      }
    }
  }

  await walk(root, '');
  return { files, skipped, bytes };
}

/**
 * Cheap fingerprint of the directory (path + size + mtime), used to detect
 * external edits without re-reading every file's contents on each poll.
 */
export async function readLocalStamp(root: FileSystemDirectoryHandle): Promise<string> {
  const rows: string[] = [];
  async function walk(dir: FileSystemDirectoryHandle, prefix: string): Promise<void> {
    for await (const [name, child] of (dir as unknown as {
      entries(): AsyncIterableIterator<[string, FileSystemDirectoryHandle | FileSystemFileHandle]>;
    }).entries()) {
      const path = prefix ? `${prefix}/${name}` : name;
      if (shouldIgnorePath(path)) continue;
      if (child.kind === 'directory') {
        await walk(child as FileSystemDirectoryHandle, path);
        continue;
      }
      try {
        const file = await (child as FileSystemFileHandle).getFile();
        rows.push(`${path}:${file.size}:${file.lastModified}`);
      } catch {
        rows.push(`${path}:?:?`);
      }
    }
  }
  await walk(root, '');
  rows.sort();
  return rows.join('\n');
}

async function resolveParent(
  root: FileSystemDirectoryHandle,
  path: string,
): Promise<{ parent: FileSystemDirectoryHandle; name: string } | null> {
  const clean = sanitizeRepoPath(path);
  if (!clean) return null;
  const parts = clean.split('/');
  let parent = root;
  for (const seg of parts.slice(0, -1)) {
    parent = await parent.getDirectoryHandle(seg, { create: true });
  }
  return { parent, name: parts[parts.length - 1] };
}

/** Write one file back to disk (creating parent directories as needed). */
export async function writeLocalFile(
  root: FileSystemDirectoryHandle,
  path: string,
  content: string,
): Promise<void> {
  const target = await resolveParent(root, path);
  if (!target) throw new Error(`Unsafe path: ${path}`);
  const handle = await target.parent.getFileHandle(target.name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

/** Delete one file from disk. Missing files are not an error. */
export async function deleteLocalFile(root: FileSystemDirectoryHandle, path: string): Promise<void> {
  const target = await resolveParent(root, path);
  if (!target) return;
  try {
    await target.parent.removeEntry(target.name);
  } catch {
    /* already gone */
  }
}

/**
 * Write the changes between `prev` and `next` to disk. Deletes are opt-in:
 * autosave must never remove user files by accident.
 */
export async function syncLocalTree(
  root: FileSystemDirectoryHandle,
  prev: FileMap,
  next: FileMap,
  options: { deletes?: boolean } = {},
): Promise<{ written: number; deleted: number }> {
  const diff = diffFileMaps(prev, next);
  let written = 0;
  for (const [path, content] of Object.entries(diff.created)) {
    await writeLocalFile(root, path, content);
    written += 1;
  }
  for (const [path, content] of Object.entries(diff.updated)) {
    await writeLocalFile(root, path, content);
    written += 1;
  }
  let deleted = 0;
  if (options.deletes) {
    for (const path of diff.deleted) {
      await deleteLocalFile(root, path);
      deleted += 1;
    }
  }
  return { written, deleted };
}

/** Explicit Save: rewrite every file in the workspace. */
export async function saveLocalTree(root: FileSystemDirectoryHandle, files: FileMap): Promise<number> {
  let written = 0;
  for (const [path, content] of Object.entries(files)) {
    if (shouldIgnorePath(path)) continue;
    await writeLocalFile(root, path, content);
    written += 1;
  }
  return written;
}

// ---- IndexedDB handle persistence (survives reloads) ----

const DB_NAME = 'zut-local-repo';
const STORE = 'handles';
const KEY = 'last';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function rememberRepo(handle: FileSystemDirectoryHandle): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(handle, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* handle persistence is best-effort */
  }
}

export async function recallRepo(): Promise<FileSystemDirectoryHandle | null> {
  if (typeof indexedDB === 'undefined') return null;
  try {
    const db = await openDb();
    const handle = await new Promise<FileSystemDirectoryHandle | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return handle;
  } catch {
    return null;
  }
}

export async function forgetRepo(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* ignore */
  }
}
