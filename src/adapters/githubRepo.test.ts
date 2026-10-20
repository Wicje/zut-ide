import { afterEach, describe, expect, it, vi } from 'vitest';
import { importGithubRepo, parseRepoUrl } from './githubRepo';

afterEach(() => {
  vi.unstubAllGlobals();
});

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe('parseRepoUrl', () => {
  it('parses https repo URLs', () => {
    expect(parseRepoUrl('https://github.com/acme/site')).toEqual({ owner: 'acme', repo: 'site' });
    expect(parseRepoUrl('https://github.com/acme/site.git')).toEqual({ owner: 'acme', repo: 'site' });
    expect(parseRepoUrl('https://github.com/acme/site/')).toEqual({ owner: 'acme', repo: 'site' });
  });

  it('keeps an explicit branch', () => {
    expect(parseRepoUrl('https://github.com/acme/site/tree/dev')).toEqual({
      owner: 'acme',
      repo: 'site',
      ref: 'dev',
    });
    expect(parseRepoUrl('https://github.com/acme/site/tree/feature/a')).toEqual({
      owner: 'acme',
      repo: 'site',
      ref: 'feature/a',
    });
  });

  it('parses scp-style remotes and owner/repo', () => {
    expect(parseRepoUrl('git@github.com:acme/site.git')).toEqual({ owner: 'acme', repo: 'site' });
    expect(parseRepoUrl('acme/site')).toEqual({ owner: 'acme', repo: 'site' });
  });

  it('rejects non-GitHub input', () => {
    expect(parseRepoUrl('https://example.com/acme/site')).toBeNull();
    expect(parseRepoUrl('just some text')).toBeNull();
    expect(parseRepoUrl('')).toBeNull();
  });
});

describe('importGithubRepo', () => {
  it('resolves a /tree/<ref>/<path> URL as a folder inside the branch', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        if (url.endsWith('/repos/acme/site')) return json({ default_branch: 'main', name: 'site' });
        if (url.includes('/git/trees/main%2Fsrc?')) return new Response('{}', { status: 404 });
        if (url.includes('/git/trees/main?')) {
          return json({
            tree: [
              { path: 'src/App.tsx', type: 'blob', size: 10 },
              { path: 'src/.env', type: 'blob', size: 10 },
              { path: 'src/logo.png', type: 'blob', size: 10 },
              { path: 'README.md', type: 'blob', size: 10 },
              { path: 'package.json', type: 'blob', size: 10 },
            ],
          });
        }
        if (url.endsWith('/main/src/App.tsx')) return new Response('export const app = 1\n');
        if (url.endsWith('/main/README.md')) return new Response('# site\n');
        if (url.endsWith('/main/package.json')) return new Response('{}\n');
        return new Response('not found', { status: 404 });
      }),
    );

    const result = await importGithubRepo('https://github.com/acme/site/tree/main/src');

    expect(result.branch).toBe('main');
    expect(Object.keys(result.files)).toEqual(['App.tsx']);
    expect(result.files['App.tsx']).toBe('export const app = 1\n');
    expect(calls.some((url) => url.includes('/git/trees/main%2Fsrc?'))).toBe(true);
  });
});
