import { K, readKey, writeKey } from './storage-keys';

const MAX_MODELS = 8;

/** Read the recently used model ids (`provider/model-id`), newest first. */
export function listRecentModels(): string[] {
  try {
    const raw = readKey(K.recentModels);
    const arr = raw ? (JSON.parse(raw) as unknown[]) : [];
    return Array.isArray(arr) ? arr.filter((m): m is string => typeof m === 'string').slice(0, MAX_MODELS) : [];
  } catch {
    return [];
  }
}

/** Record a model pick; dedupes by id and keeps the newest MAX_MODELS. */
export function pushRecentModel(id: string): string[] {
  const clean = id.trim();
  if (!clean) return listRecentModels();
  const next = [clean, ...listRecentModels().filter((m) => m !== clean)].slice(0, MAX_MODELS);
  try {
    writeKey(K.recentModels, JSON.stringify(next));
  } catch {
    /* quota — usage order just does not persist */
  }
  return next;
}
