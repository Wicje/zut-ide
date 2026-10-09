// Push a project to GitHub with a classic personal token (repo scope).
// Creates the repo under the token owner, then writes every file via the
// contents API (create or update). No OAuth dance, no server.
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
    const body = (await res.json().catch(() => null)) as { errors?: Array<{ message?: string }> } | null;
    const msg = body?.errors?.[0]?.message ?? 'GitHub rejected the request (name taken?).';
    throw new Error(msg);
  }
  if (res.status === 404) throw new Error('Not found — check the repo name and token scope.');
  if (!res.ok) throw new Error(`GitHub request failed (${res.status})`);
  if (res.status === 204) return null as T;
  return (await res.json()) as T;
}

export async function pushToGithub(
  repo: string,
  isPrivate: boolean,
  files: FileMap,
  token: string,
): Promise<{ url: string }> {
  const names = Object.keys(files);
  if (names.length === 0) throw new Error('Nothing to push.');
  if (names.length > 50) throw new Error('Too many files for direct push (limit 50).');

  const created = await gh<{ html_url: string; full_name: string; default_branch: string }>(
    '/user/repos',
    token,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: repo, private: isPrivate, auto_init: false }) },
  );
  const [owner, name] = created.full_name.split('/');
  const branch = created.default_branch || 'main';

  for (const path of names) {
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    let sha: string | undefined;
    try {
      const existing = await gh<{ sha: string }>(`/repos/${owner}/${name}/contents/${encoded}?ref=${branch}`, token);
      sha = existing.sha;
    } catch {
      /* new file */
    }
    await gh(`/repos/${owner}/${name}/contents/${encoded}`, token, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Add ${path} via zut IDE`,
        content: toBase64(files[path]),
        branch,
        ...(sha ? { sha } : {}),
      }),
    });
  }
  return { url: created.html_url };
}
