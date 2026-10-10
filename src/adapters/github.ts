// GitHub flow (industry standard): create-if-missing, ONE commit per push,
// feature branches, conventional messages, real pull requests.
// Classic personal token (repo scope). No OAuth dance, no server.
import type { FileMap } from './filemap';

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function gh<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401) throw new Error('Bad token — check it has the `repo` scope.');
  if (res.status === 422) {
    const body = (await res.json().catch(() => null)) as { errors?: Array<{ message?: string }>; message?: string } | null;
    throw new Error(body?.errors?.[0]?.message ?? body?.message ?? 'GitHub rejected the request.');
  }
  if (res.status === 404) throw new Error('Not found — check the repo name and token scope.');
  if (!res.ok) throw new Error(`GitHub request failed (${res.status})`);
  if (res.status === 204) return null as T;
  return (await res.json()) as T;
}

export interface PushOptions {
  /** Feature branch. Empty = the repo's default branch. */
  branch?: string;
  /** Conventional commit message. Defaults to `chore: sync <repo> from Zut`. */
  message?: string;
}

export interface PushResult {
  url: string;
  owner: string;
  repo: string;
  branch: string;
  defaultBranch: string;
  sha: string;
  created: boolean;
}

const MAX_FILES = 200;

function slugBranch(name: string): string {
  const s = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  if (!s || s.startsWith('/') || s.endsWith('/') || s.includes('..')) throw new Error('Bad branch name.');
  return s;
}

export function defaultPushMessage(repo: string): string {
  return `chore: sync ${repo} from Zut`;
}

export async function pushToGithub(
  repo: string,
  isPrivate: boolean,
  files: FileMap,
  token: string,
  opts: PushOptions = {},
): Promise<PushResult> {
  const names = Object.keys(files);
  if (names.length === 0) throw new Error('Nothing to push.');
  if (names.length > MAX_FILES) throw new Error(`Too many files for direct push (limit ${MAX_FILES}).`);
  const repoName = repo.trim();
  if (!/^[\w.-]+$/.test(repoName)) throw new Error('Repo name may only contain letters, numbers, ., _ and -.');

  const me = await gh<{ login: string }>('/user', token);
  const owner = me.login;

  // Create-if-missing; otherwise push to the existing repo.
  let defaultBranch = 'main';
  let created = false;
  try {
    const existing = await gh<{ default_branch?: string }>(`/repos/${owner}/${repoName}`, token);
    if (existing.default_branch) defaultBranch = existing.default_branch;
  } catch {
    const made = await gh<{ default_branch?: string }>('/user/repos', token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: repoName, private: isPrivate, auto_init: false }),
    });
    if (made.default_branch) defaultBranch = made.default_branch;
    created = true;
  }

  const branch = opts.branch?.trim() ? slugBranch(opts.branch) : defaultBranch;

  // Head of the target branch (null = new branch / empty repo).
  let baseTree: string | null = null;
  let branchExisted = false;
  const parents: string[] = [];
  try {
    const ref = await gh<{ object: { sha: string } }>(
      `/repos/${owner}/${repoName}/git/ref/heads/${branch}`,
      token,
    );
    branchExisted = true;
    parents.push(ref.object.sha);
    const commit = await gh<{ tree: { sha: string } }>(
      `/repos/${owner}/${repoName}/git/commits/${ref.object.sha}`,
      token,
    );
    baseTree = commit.tree.sha;
  } catch {
    // New branch: build on the default head so history stays connected.
    if (branch !== defaultBranch) {
      try {
        const def = await gh<{ object: { sha: string } }>(
          `/repos/${owner}/${repoName}/git/ref/heads/${defaultBranch}`,
          token,
        );
        parents.push(def.object.sha);
        const commit = await gh<{ tree: { sha: string } }>(
          `/repos/${owner}/${repoName}/git/commits/${def.object.sha}`,
          token,
        );
        baseTree = commit.tree.sha;
      } catch {
        /* empty repo — root commit */
      }
    }
  }

  // One blob per file, one tree, one commit.
  const blobs = await Promise.all(
    names.map(async (p) => {
      const b = await gh<{ sha: string }>(`/repos/${owner}/${repoName}/git/blobs`, token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: toBase64(files[p]), encoding: 'base64' }),
      });
      return { path: p, mode: '100644' as const, type: 'blob' as const, sha: b.sha };
    }),
  );
  const treeBody: { tree: unknown[]; base_tree?: string } = { tree: blobs };
  if (baseTree) treeBody.base_tree = baseTree;
  const tree = await gh<{ sha: string }>(`/repos/${owner}/${repoName}/git/trees`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(treeBody),
  });
  const message = opts.message?.trim() || defaultPushMessage(repoName);
  const commit = await gh<{ sha: string }>(`/repos/${owner}/${repoName}/git/commits`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, tree: tree.sha, parents }),
  });
  if (branchExisted) {
    // Fast-forward only: fails loudly if the branch moved (never force-pushes).
    await gh(`/repos/${owner}/${repoName}/git/refs/heads/${branch}`, token, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha: commit.sha }),
    });
  } else {
    await gh(`/repos/${owner}/${repoName}/git/refs`, token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }),
    });
  }

  return {
    url: `https://github.com/${owner}/${repoName}${branch !== defaultBranch ? `/tree/${branch}` : ''}`,
    owner,
    repo: repoName,
    branch,
    defaultBranch,
    sha: commit.sha,
    created,
  };
}

/** Open a real pull request (feature branch -> default branch). */
export async function createPullRequest(
  owner: string,
  repo: string,
  head: string,
  base: string,
  title: string,
  token: string,
): Promise<{ url: string }> {
  if (!title.trim()) throw new Error('PR needs a title.');
  const pr = await gh<{ html_url: string }>(`/repos/${owner}/${repo}/pulls`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: title.trim(), head, base, maintainer_can_modify: true }),
  });
  return { url: pr.html_url };
}
