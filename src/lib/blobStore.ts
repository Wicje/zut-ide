// Big-value browser storage: IndexedDB, with localStorage and in-memory
// fallbacks.
//
// localStorage caps around 5MB — a draft or a few snapshots of a real
// codebase blows through it. IndexedDB has no practical cap, so the three
// large values (draft, snapshots, sessions) live here. Reads are
// synchronous because the app boots synchronously: main.tsx awaits
// `hydrateBlobStore()` before mounting. Writes are write-through into the
// in-memory cache (immediate) and flushed to IndexedDB on a short debounce
// (keystroke storms collapse into one transaction).
//
// Environments without IndexedDB (node test runners, some private modes)
// transparently fall back to localStorage, then to an in-memory map.

import { readKey, writeKey, removeKey, K } from './storage-keys';

const DB_NAME = 'zut-blobs';
const STORE = 'kv';

/** The values that are too big for localStorage. */
export const BIG_STORAGE_KEYS: ReadonlyArray<string> = [K.draft, K.snapshots, K.sessions];

const mem = new Map<string, string>();
let hydrated = false;
let db: IDBDatabase | null = null;
let dbFailed = false;
const pendingWrites = new Map<string, string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function dbAll(database: IDBDatabase): Promise<Array<[string, string]>> {
  return new Promise((resolve) => {
    try {
      const tx = database.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAllKeys();
      const reqValues = tx.objectStore(STORE).getAll();
      req.onsuccess = () => {
        reqValues.onsuccess = () => {
          const keys = req.result as string[];
          const values = reqValues.result as string[];
          resolve(keys.map((k, i) => [k, values[i]] as [string, string]));
        };
        reqValues.onerror = () => resolve([]);
      };
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

function dbPut(database: IDBDatabase, key: string, value: string): void {
  try {
    database.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key);
  } catch {
    /* quota — the in-memory copy still serves this session */
  }
}

function dbDelete(database: IDBDatabase, key: string): void {
  try {
    database.transaction(STORE, 'readwrite').objectStore(STORE).delete(key);
  } catch {
    /* ignore */
  }
}

function flushWrites(): void {
  flushTimer = null;
  if (!db) return;
  for (const [k, v] of pendingWrites) dbPut(db, k, v);
  pendingWrites.clear();
}

function scheduleFlush(key: string, value: string): void {
  pendingWrites.set(key, value);
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flushWrites, 250);
}

/** Load big values into memory. Call once before the app mounts. */
export async function hydrateBlobStore(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  if (typeof indexedDB === 'undefined') {
    for (const k of BIG_STORAGE_KEYS) {
      const v = readKey(k);
      if (v !== null) mem.set(k, v);
    }
    return;
  }
  db = await openDb();
  dbFailed = !db;
  if (!db) {
    for (const k of BIG_STORAGE_KEYS) {
      const v = readKey(k);
      if (v !== null) mem.set(k, v);
    }
    return;
  }
  for (const [k, v] of await dbAll(db)) mem.set(k, String(v));
  // One-time move: anything still in localStorage that belongs to IndexedDB.
  const database = db;
  const pending = BIG_STORAGE_KEYS.map(
    (k) =>
      new Promise<void>((resolve) => {
        let raw: string | null = null;
        try {
          raw = localStorage.getItem(k);
        } catch {
          raw = null;
        }
        if (!raw || mem.has(k)) {
          if (raw && mem.has(k)) {
            try { localStorage.removeItem(k); } catch { /* ignore */ }
          }
          return resolve();
        }
        mem.set(k, raw);
        try {
          const tx = database.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).put(raw, k);
          // Only drop the localStorage copy once IDB has committed the value.
          tx.oncomplete = () => {
            try { localStorage.removeItem(k); } catch { /* ignore */ }
            resolve();
          };
          tx.onerror = () => resolve(); // keep localStorage as backup
        } catch {
          resolve(); // db write failed — keep localStorage as backup
        }
      }),
  );
  await Promise.all(pending);
}

/** Read a big value (synchronous; serve from memory). */
export function readBlob(key: string): string | null {
  const v = mem.get(key);
  if (v !== undefined) return v;
  // Not seen during hydration (e.g. written then deleted elsewhere): fall back.
  return typeof indexedDB === 'undefined' || dbFailed ? readKey(key) : null;
}

/** Write a big value: memory now, IndexedDB next flush. */
export function writeBlob(key: string, value: string): void {
  if (typeof indexedDB === 'undefined' || dbFailed) {
    writeKey(key, value);
    return;
  }
  mem.set(key, value);
  scheduleFlush(key, value);
}

/** Remove a big value. */
export function removeBlob(key: string): void {
  mem.delete(key);
  pendingWrites.delete(key);
  if (db) dbDelete(db, key);
  removeKey(key);
}
