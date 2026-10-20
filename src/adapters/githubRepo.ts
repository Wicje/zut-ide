// Import a GitHub repository into a FileMap without a native git binary.
//
// This is an import (tree + files), not a clone: no history, branches, or
// .git directory. The host's real `git clone` supersedes it when available.
// Public repos use the tree API + raw CDN. Private repos need a token and use
// the authenticated contents API.
import type { FileMap } from './filemap';
import { isTextPath, shouldIgnorePath } from './localRepo';

export interface RepoRef {
  owner: string;
  repo: string;
  ref?: string;
}

export interface RepoImport {
  name: string;
  files: FileMap;
  owner: string;
  repo: string;
  branch: string;
  truncated: boolean;
  skipped: string[];
}

const MAX_FILES = 500;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;
const CONCURRENCY = 6;

/** Pure: accept a GitHub URL, an scp-style remote, or `owner/repo`. */
export function parseRepoUrl(input: string): RepoRef | null {
  const raw = input.trim();
  if (!raw) return null;

  const scp = raw.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i);
  if (scp) return { owner: scp[1], repo: scp[2].replace(/\.git$/i, '') };

  try {
    const url = new URL(raw);
    if (!/(^|\.)github\.com$/i.test(url.hostname)) return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/i, '');
    // /owner/repo/tree/<ref>
    let ref: string | undefined;
    if (parts[2] === 'tree' && parts[3]) ref = decodeURIComponent(parts.slice(3).join('/'));
    return { owner, repo, ...(ref ? { ref } : {}) };
  } catch {
    const slug = raw.match(/^([\w.-]+)\/([\w.-]+)$/);
    if (slug) return { owner: slug[1], repo: slug[2].replace(/\.git$/i, '') };
    return null;
  }
}

function ghHeaders(token?: string): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function friendly(status: number, token: string | null): Error {
  if (status === 404) {
    return new Error(
      token
        ? 'Repository not found — check the name and that the token can read it.'
        : 'Repository not found. Private repos need a GitHub token (Account → connectors).',
    );
  }
  if (status === 403) return new Error('GitHub rate limit reached. Add a GitHub token for a higher limit.');
  if (status === 401) return new Error('Bad GitHub token — check it still has access.');
  return new Error(`GitHub request failed (${status}).`);
}

interface TreeEntry {
  path: string;
  type: string;
  size?: number;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

async function fetchRaw(ref: RepoRef, branch: string, path: string, token: string | null): Promise<string> {
  if (token) {
    const res = await fetch(
      `https://api.github.com/repos/${ref.owner}/${ref.repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`,
      { headers: { ...ghHeaders(token), Accept: 'application/vnd.github.raw' } },
    );
    if (!res.ok) throw friendly(res.status, token);
    return res.text();
  }
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(
    `https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/${encodeURIComponent(branch)}/${encoded}`,
  );
  if (!res.ok) throw friendly(res.status, token);
  return res.text();
}

/** Import a public or private GitHub repo's files (bounded). */
export async function importGithubRepo(input: string, token: string | null = null): Promise<RepoImport> {
  const ref = parseRepoUrl(input);
  if (!ref) throw new Error('Enter a GitHub repo like https://github.com/owner/repo.');

  const repoRes = await fetch(`https://api.github.com/repos/${ref.owner}/${ref.repo}`, {
    headers: ghHeaders(token ?? undefined),
  });
  if (repoRes.status === 404) throw friendly(404, token);
  if (repoRes.status === 403) throw friendly(403, token);
  if (!repoRes.ok) throw friendly(repoRes.status, token);
  const meta = (await repoRes.json()) as { default_branch?: string; name?: string };
  const baseRef = ref.ref || meta.default_branch || 'main';

  // GitHub can't tell us whether `/tree/a/b` means branch `a/b` or path `b`
  // inside branch `a`. Try the full ref first, then split from the right —
  // the first tree that resolves wins.
  const parts = baseRef.split('/').filter(Boolean);
  const candidates: Array<{ ref: string; prefix: string }> = [{ ref: baseRef, prefix: '' }];
  for (let i = parts.length - 1; i >= 1; i -= 1) {
    candidates.push({ ref: parts.slice(0, i).join('/'), prefix: parts.slice(i).join('/') });
  }

  let tree: { tree?: TreeEntry[]; truncated?: boolean } | null = null;
  let branch = baseRef;
  let prefix = '';
  let lastStatus = 0;
  for (const candidate of candidates) {
    const treeRes = await fetch(
      `https://api.github.com/repos/${ref.owner}/${ref.repo}/git/trees/${encodeURIComponent(candidate.ref)}?recursive=1`,
      { headers: ghHeaders(token ?? undefined) },
    );
    if (treeRes.ok) {
      tree = (await treeRes.json()) as { tree?: TreeEntry[]; truncated?: boolean };
      branch = candidate.ref;
      prefix = candidate.prefix ? `${candidate.prefix.replace(/^\/+|\/+$/g, '')}/` : '';
      break;
    }
    lastStatus = treeRes.status;
    if (treeRes.status !== 404 && treeRes.status !== 422) throw friendly(treeRes.status, token);
  }
  if (!tree) throw friendly(lastStatus || 404, token);

  // Strip the `/tree/<ref>/<path>` prefix so the imported project is rooted at
  // the folder the user pointed at.
  const blobs = (tree.tree ?? [])
    .filter((e) => e.type === 'blob' && (!prefix || e.path.startsWith(prefix)))
    .map((e) => ({ ...e, path: prefix ? e.path.slice(prefix.length) : e.path, repoPath: e.path }))
    .filter((e) => isTextPath(e.path) && !shouldIgnorePath(e.path));

  const skipped: string[] = [];
  let budget = MAX_TOTAL_BYTES;
  const selected: Array<TreeEntry & { repoPath: string }> = [];
  for (const entry of blobs) {
    if (selected.length >= MAX_FILES) {
      skipped.push(`${entry.path} (file limit)`);
      continue;
    }
    const size = entry.size ?? 0;
    if (size > MAX_FILE_BYTES) {
      skipped.push(`${entry.path} (>${Math.round(MAX_FILE_BYTES / 1024)}KB)`);
      continue;
    }
    if (size > budget) {
      skipped.push(`${entry.path} (repo size limit)`);
      continue;
    }
    budget -= size;
    selected.push(entry);
  }

  const files: FileMap = {};
  const results = await mapLimit(selected, CONCURRENCY, async (entry) => {
    try {
      const text = await fetchRaw(ref, branch, entry.repoPath, token);
      return { path: entry.path, text, ok: true as const };
    } catch (e) {
      return { path: entry.path, text: '', ok: false as const, error: (e as Error).message };
    }
  });
  for (const r of results) {
    if (r.ok) files[r.path] = r.text;
    else skipped.push(`${r.path} (${r.error})`);
  }

  if (Object.keys(files).length === 0) {
    throw new Error('No readable text files found in that repository.');
  }

  return {
    name: meta.name || ref.repo,
    files,
    owner: ref.owner,
    repo: ref.repo,
    branch,
    truncated: Boolean(tree.truncated),
    skipped,
  };
}
