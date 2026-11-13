// Context engine v1: deterministic, dependency-free retrieval over the
// in-memory workspace. Finds the files most relevant to a task so the agent
// sees them instead of guessing — retrieval before generation, not after.
import type { FileMap } from '../adapters/filemap';

const STOP = new Set([
  'the', 'a', 'an', 'to', 'of', 'in', 'on', 'for', 'and', 'or', 'is', 'it', 'its', 'this', 'that',
  'with', 'make', 'build', 'add', 'create', 'fix', 'update', 'change', 'edit', 'new', 'use', 'using',
  'when', 'what', 'how', 'where', 'why', 'please', 'i', 'we', 'you', 'me', 'my', 'can', 'should',
]);

function tokenize(text: string): string[] {
  return (
    text
      .toLowerCase()
      .match(/[a-z0-9_]{2,}/g)
      ?.filter((t) => !STOP.has(t)) ?? []
  );
}

function countOccurrences(haystack: string, needle: string, cap = 60): number {
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count += 1;
    idx += needle.length;
    if (count >= cap) break;
  }
  return count;
}

/** A grouped map of the repository: one line per directory, so the model
 *  sees the shape of the whole project in ~a screen of text, not 10k lines. */
export function repoMap(files: FileMap, maxEntries = 400): string {
  const names = Object.keys(files).sort();
  const total = names.length;
  const byDir = new Map<string, string[]>();
  for (const name of names.slice(0, maxEntries)) {
    const idx = name.indexOf('/');
    const dir = idx === -1 ? '.' : name.slice(0, idx);
    const bucket = byDir.get(dir) ?? [];
    bucket.push(name);
    byDir.set(dir, bucket);
  }
  const lines = [...byDir.entries()].map(([dir, fs]) => `${dir}/  (${fs.length}): ${fs.join(', ')}`);
  return `Project map (${total} files${total > maxEntries ? `, first ${maxEntries}` : ''}):\n${lines.join('\n')}`;
}

export interface RetrievedContext {
  path: string;
  content: string;
  score: number;
}

/** Rank files for a task. `attachedPaths` are forced in with full weight and
 *  priority (the user explicitly pinned them with @). Others score on path
 *  token match + content term frequency, then the result is size-budgeted. */
export function retrieveContext(
  files: FileMap,
  query: string,
  attachedPaths: string[] = [],
  opts: { limit?: number; perFileChars?: number; budgetChars?: number } = {},
): RetrievedContext[] {
  const { limit = 8, perFileChars = 6000, budgetChars = 22000 } = opts;
  const qTokens = tokenize(query);
  const resolve = (needle: string): string | undefined => {
    const lower = needle.toLowerCase();
    return (
      Object.keys(files).find((p) => p === needle) ??
      Object.keys(files).find((p) => p.toLowerCase().endsWith('/' + lower)) ??
      Object.keys(files).find((p) => p.split('/').pop()?.toLowerCase() === lower)
    );
  };

  const out: RetrievedContext[] = [];
  const taken = new Set<string>();

  for (const path of attachedPaths) {
    const exact = resolve(path);
    if (!exact || taken.has(exact)) continue;
    taken.add(exact);
    out.push({ path: exact, content: files[exact], score: 100 });
  }

  const scored: RetrievedContext[] = [];
  for (const path of Object.keys(files)) {
    if (taken.has(path)) continue;
    let score = 0;
    const lowerPath = path.toLowerCase();
    for (const t of qTokens) {
      if (lowerPath.includes(t)) score += 6;
    }
    // Content scan only for plausibly-relevant files: path must carry at
    // least one query token, or the file name itself does the talking.
    const content = files[path];
    if (content.length <= 400_000 && qTokens.length > 0) {
      const lower = content.toLowerCase();
      for (const t of qTokens) {
        const hits = countOccurrences(lower, t);
        if (hits > 0) score += Math.min(6, Math.log2(1 + hits));
      }
    }
    if (score > 0) scored.push({ path, content, score });
  }
  scored.sort((a, b) => b.score - a.score);
  for (const r of scored) {
    if (out.length >= limit) break;
    out.push(r);
  }

  let budget = budgetChars;
  return out
    .map((r) => {
      const slice =
        r.content.length > perFileChars ? `${r.content.slice(0, perFileChars)}\n…(truncated)` : r.content;
      return { path: r.path, content: slice, score: r.score };
    })
    .filter((r) => {
      if (r.content.length > budget) return false;
      budget -= r.content.length;
      return true;
    });
}

/** Format retrievals as context lines for the system prompt. */
export function formatRetrieved(retrieved: RetrievedContext[]): string {
  if (retrieved.length === 0) return '';
  const body = retrieved
    .map((r) => `### ${r.path}\n\`\`\`\n${r.content}\n\`\`\``)
    .join('\n\n');
  return `\nFiles retrieved for this task — read these before editing:\n\n${body}`;
}
