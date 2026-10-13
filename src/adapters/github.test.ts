import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  defaultPushMessage,
  githubLogin,
  listBranches,
  listCommits,
  pushToGithub,
} from './github'

// Minimal fetch stub: route by URL suffix.
function mockFetch(routes: Array<[string, { status?: number; body?: unknown } | Error]>) {
  return vi.fn(async (url: string) => {
    const hit = routes.find(([suffix]) => url.endsWith(suffix));
    if (!hit) throw new Error(`unexpected fetch: ${url}`);
    const spec = hit[1];
    if (spec instanceof Error) throw spec;
    const { status = 200, body = {} } = spec;
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    };
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('github adapter', () => {
  it('builds the default message', () => {
    expect(defaultPushMessage('demo')).toBe('chore: sync demo from Zut');
  });

  it('resolves login', async () => {
    vi.stubGlobal('fetch', mockFetch([['/user', { body: { login: 'octo' } }]]));
    await expect(githubLogin('t')).resolves.toBe('octo');
  });

  it('lists branches with protection flags', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([['/branches?per_page=100', { body: [{ name: 'main', protected: true }, { name: 'feat' }] }]]),
    );
    await expect(listBranches('o', 'r', 't')).resolves.toEqual([
      { name: 'main', protected: true },
      { name: 'feat', protected: false },
    ]);
  });

  it('lists commits newest-first with short shas', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch([
        [
          '/commits?sha=main&per_page=2',
          {
            body: [
              {
                sha: 'abcdef1234567890',
                html_url: 'https://github.com/o/r/commit/abcdef1',
                commit: { message: 'feat: x\n\nbody', author: { name: 'Ada', date: '2026-01-02T03:04:05Z' } },
              },
            ],
          },
        ],
      ]),
    );
    await expect(listCommits('o', 'r', 'main', 't', 2)).resolves.toEqual([
      {
        sha: 'abcdef1234567890',
        shortSha: 'abcdef1',
        message: 'feat: x',
        author: 'Ada',
        date: '2026-01-02',
        url: 'https://github.com/o/r/commit/abcdef1',
      },
    ]);
  });

  it('rejects a moved branch with plain words, never force-pushes', async () => {
    const files = { 'index.html': '<h1>hi</h1>' };
    vi.stubGlobal(
      'fetch',
      mockFetch([
        ['/user', { body: { login: 'octo' } }],
        ['/repos/octo/demo', { body: { default_branch: 'main' } }],
        ['/git/ref/heads/main', { body: { object: { sha: 'base' } } }],
        ['/git/commits/base', { body: { tree: { sha: 'tree0' } } }],
        ['/git/blobs', { body: { sha: 'blob1' } }],
        ['/git/trees', { body: { sha: 'tree1' } }],
        ['/git/commits', { body: { sha: 'commit1' } }],
        // Ref PATCH fails: someone moved the branch.
        ['/git/refs/heads/main', { status: 422, body: { message: 'Reference update failed' } }],
      ]),
    );
    await expect(pushToGithub('demo', true, files, 't', {})).rejects.toThrow(/moved on GitHub.*nothing was overwritten/);
  });

  it('pushes a new branch when the ref is missing', async () => {
    const failRef = new Error('Not found — check the repo name and token scope.');
    const calls: string[] = [];
    const inner = mockFetch([
      ['/user', { body: { login: 'octo' } }],
      ['/repos/octo/demo', { body: { default_branch: 'main' } }],
      ['/git/blobs', { body: { sha: 'blob1' } }],
      ['/git/trees', { body: { sha: 'tree1' } }],
      ['/git/commits', { body: { sha: 'commit1' } }],
      ['/git/refs', { body: {} }],
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push(`${init?.method ?? 'GET'} ${url}`);
        // Branch head + default head lookups fail (fresh repo/branch).
        if (url.includes('/git/ref/heads/')) throw failRef;
        if (url.includes('/git/commits/')) throw failRef;
        return inner(url);
      }),
    );
    const r = await pushToGithub('demo', true, { 'index.html': 'x' }, 't', { branch: 'feat' });
    expect(r.branch).toBe('feat');
    expect(r.url).toBe('https://github.com/octo/demo/tree/feat');
    expect(calls.some((c) => c.startsWith('POST') && c.endsWith('/git/refs'))).toBe(true);
  });
});
