// Self-hosted opencode agent client (server on your machine, files on disk).
// The IDE syncs FileMap -> disk, the agent edits with real tools, we diff back.
import type { FileMap } from './filemap';
import type { ChatMsg } from './providers';

const DEFAULT_URL = 'http://127.0.0.1:4096';
const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:4331';

const baseUrl = (import.meta.env.VITE_OPENCODE_URL as string | undefined) || DEFAULT_URL;
const bridgeUrl = (import.meta.env.VITE_OPENCODE_BRIDGE_URL as string | undefined) || DEFAULT_BRIDGE_URL;
const bridgeToken = import.meta.env.VITE_OPENCODE_BRIDGE_TOKEN as string | undefined;

function bridgeHeaders(extra?: Record<string, string>): Record<string, string> {
  return { ...extra, ...(bridgeToken ? { Authorization: `Bearer ${bridgeToken}` } : {}) };
}

export async function isBridgeAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${bridgeUrl}/health`, {
      headers: bridgeHeaders(),
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function isOpencodeAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/global/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function selfHostReady(): Promise<boolean> {
  const [a, b] = await Promise.all([isOpencodeAvailable(), isBridgeAvailable()]);
  return a && b;
}

export interface OpencodeModelOption {
  providerID: string;
  id: string;
  name: string;
  free: boolean;
}

let modelsCache: OpencodeModelOption[] | null = null;

/** Models served by the local opencode server (connected providers only). */
export async function listOpencodeModels(): Promise<OpencodeModelOption[]> {
  if (modelsCache) return modelsCache;
  const res = await fetch(`${baseUrl}/provider`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Model list failed (${res.status})`);
  const json = (await res.json()) as {
    all?: Array<{ id?: string; providerID?: string; name?: string; cost?: { input?: number; output?: number } }>;
    connected?: string[];
  };
  const connected = new Set(json.connected ?? []);
  const out = (json.all ?? [])
    .filter((m) => m.id && m.providerID && connected.has(m.providerID))
    .map((m) => ({
      providerID: m.providerID as string,
      id: m.id as string,
      name: m.name || (m.id as string),
      free: (m.cost?.input ?? 1) === 0 && (m.cost?.output ?? 1) === 0,
    }))
    .sort((a, b) => Number(b.free) - Number(a.free) || a.name.localeCompare(b.name));
  modelsCache = out;
  return out;
}

const MODEL_LS = 'zut:opencode-model';

export function getOpencodeModel(): { providerID: string; modelID: string } | null {
  try {
    const raw = localStorage.getItem(MODEL_LS);
    if (!raw) return null;
    const j = JSON.parse(raw) as { providerID?: string; modelID?: string };
    if (j.providerID && j.modelID) return { providerID: j.providerID, modelID: j.modelID };
    return null;
  } catch {
    return null;
  }
}

export function setOpencodeModel(m: { providerID: string; modelID: string } | null): void {
  try {
    if (!m) localStorage.removeItem(MODEL_LS);
    else localStorage.setItem(MODEL_LS, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

/** Write the IDE's virtual project files to the disk workspace opencode edits. */
export async function syncProjectToDisk(files: FileMap): Promise<void> {
  const res = await fetch(`${bridgeUrl}/write`, {
    method: 'POST',
    headers: bridgeHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ files }),
  });
  if (!res.ok) throw new Error(`File sync failed (${res.status})`);
}

/** Read the disk workspace back (files opencode may have created/edited). */
export async function readProjectFromDisk(): Promise<FileMap> {
  const res = await fetch(`${bridgeUrl}/read-tree`, { headers: bridgeHeaders() });
  if (!res.ok) throw new Error(`File read failed (${res.status})`);
  const json = (await res.json()) as { files?: FileMap };
  return json.files ?? {};
}

export function computeProjectChanges(
  prev: FileMap,
  next: FileMap,
): { updated: Record<string, string>; created: Record<string, string>; deleted: string[] } {
  const updated: Record<string, string> = {};
  const created: Record<string, string> = {};
  const deleted: string[] = [];
  for (const [p, c] of Object.entries(next)) {
    const before = prev[p];
    if (before === undefined) created[p] = c;
    else if (before !== c) updated[p] = c;
  }
  for (const p of Object.keys(prev)) {
    if (!(p in next)) deleted.push(p);
  }
  return { updated, created, deleted };
}

async function createSession(): Promise<string> {
  const res = await fetch(`${baseUrl}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) throw new Error('Failed to create opencode session');
  const json = (await res.json()) as { data?: { id?: string }; id?: string };
  const id = json.data?.id ?? json.id;
  if (!id) throw new Error('No session ID returned');
  return id;
}

/**
 * One agent turn with file edits: sync to disk, prompt, stream the reply,
 * read the tree back. Returns reply text + the file diff to apply.
 */
export async function opencodeTurn(
  files: FileMap,
  prompt: string,
  system: string,
  onDelta: (text: string) => void,
  model?: { providerID: string; modelID: string },
): Promise<{ reply: string; updated: Record<string, string>; created: Record<string, string>; deleted: string[] }> {
  await syncProjectToDisk(files);
  const sessionId = await createSession();

  await fetch(`${baseUrl}/session/${sessionId}/prompt_async`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parts: [{ type: 'text', text: prompt }], system, ...(model ? { model } : {}) }),
  }).then((res) => {
    if (!res.ok) throw new Error(`Agent prompt failed (${res.status})`);
  });

  // Stream assistant text over SSE until the session goes idle.
  const reply = await new Promise<string>((resolve, reject) => {
    const source = new EventSource(`${baseUrl}/event`);
    const assistantIds = new Set<string>();
    const userIds = new Set<string>();
    const partTexts = new Map<string, string>();
    let done = false;
    const finish = (fn: () => void) => {
      if (!done) {
        done = true;
        source.close();
        fn();
      }
    };
    const timeout = setTimeout(() => finish(() => reject(new Error('Agent response timed out'))), 120_000);
    source.onmessage = (ev) => {
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(ev.data) as Record<string, unknown>;
      } catch {
        return;
      }
      const props = (event.properties ?? event) as Record<string, unknown>;
      if ((props.sessionID ?? props.session_id) && props.sessionID !== sessionId && props.session_id !== sessionId) return;
      const type = event.type as string | undefined;
      if (type === 'message.updated') {
        const info = props.info as Record<string, unknown> | undefined;
        if (info?.role === 'user' && typeof info.id === 'string') userIds.add(info.id);
        if (info?.role === 'assistant' && typeof info.id === 'string') assistantIds.add(info.id);
      } else if (type === 'message.part.updated') {
        const part = props.part as Record<string, unknown> | undefined;
        if (!part || part.type !== 'text' || typeof part.text !== 'string') return;
        const mid = part.messageID as string | undefined;
        if (mid && (userIds.has(mid) || !assistantIds.has(mid))) return;
        const pid = (part.id ?? mid ?? 'p') as string;
        const prev = partTexts.get(pid) ?? '';
        const text = part.text;
        partTexts.set(pid, text);
        if (text.startsWith(prev)) {
          const delta = text.slice(prev.length);
          if (delta) onDelta(delta);
        }
      } else if (type === 'session.error') {
        clearTimeout(timeout);
        const err = props.error as Record<string, unknown> | undefined;
        const msg = (err?.data as Record<string, unknown> | undefined)?.message;
        finish(() => reject(new Error(typeof msg === 'string' ? msg : 'Agent request failed')));
      } else if (type === 'session.idle') {
        clearTimeout(timeout);
        finish(() => resolve([...partTexts.values()].join('\n')));
      }
    };
    source.onerror = () => {
      if (!done) {
        /* EventSource auto-reconnects; the idle event still resolves */
      }
    };
  });

  const tree = await readProjectFromDisk();
  const { updated, created, deleted } = computeProjectChanges(files, tree);
  return { reply: reply.slice(0, 20000), updated, created, deleted };
}
