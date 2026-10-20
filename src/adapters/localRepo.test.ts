import { describe, expect, it } from 'vitest';
import {
  diffFileMaps,
  isTextPath,
  sanitizeRepoPath,
  shouldIgnorePath,
} from './localRepo';

describe('shouldIgnorePath', () => {
  it('skips generated and dependency directories', () => {
    expect(shouldIgnorePath('node_modules/react/index.js')).toBe(true);
    expect(shouldIgnorePath('.git/objects/ab/cdef')).toBe(true);
    expect(shouldIgnorePath('packages/app/dist/main.js')).toBe(true);
    expect(shouldIgnorePath('.venv/lib/python3.12/site.py')).toBe(true);
  });

  it('skips env files', () => {
    expect(shouldIgnorePath('.env')).toBe(true);
    expect(shouldIgnorePath('.env.local')).toBe(true);
    expect(shouldIgnorePath('config/.env.production')).toBe(true);
    expect(shouldIgnorePath('.env.example')).toBe(true);
  });

  it('keeps ordinary source paths', () => {
    expect(shouldIgnorePath('src/App.tsx')).toBe(false);
    expect(shouldIgnorePath('README.md')).toBe(false);
    expect(shouldIgnorePath('src/environment.ts')).toBe(false);
    expect(shouldIgnorePath('src/node_modules-ish/file.ts')).toBe(false);
  });
});

describe('isTextPath', () => {
  it('accepts code and config extensions', () => {
    for (const p of ['a.ts', 'a.tsx', 'a.py', 'a.go', 'a.rs', 'a.css', 'a.json', 'a.yml', 'a.sql', 'a.vue']) {
      expect(isTextPath(p), p).toBe(true);
    }
  });

  it('accepts known extension-less text files', () => {
    expect(isTextPath('Makefile')).toBe(true);
    expect(isTextPath('Dockerfile')).toBe(true);
    expect(isTextPath('.gitignore')).toBe(true);
    expect(isTextPath('LICENSE')).toBe(true);
  });

  it('rejects binaries and unknown blobs', () => {
    expect(isTextPath('logo.png')).toBe(false);
    expect(isTextPath('app.wasm')).toBe(false);
    expect(isTextPath('archive.zip')).toBe(false);
  });
});

describe('sanitizeRepoPath', () => {
  it('normalises separators and dot segments', () => {
    expect(sanitizeRepoPath('src\\components/./App.tsx')).toBe('src/components/App.tsx');
    expect(sanitizeRepoPath('/src/a.ts')).toBeNull();
  });

  it('rejects escapes and absolute paths', () => {
    expect(sanitizeRepoPath('../secrets.txt')).toBeNull();
    expect(sanitizeRepoPath('src/../../secrets.txt')).toBeNull();
    expect(sanitizeRepoPath('C:/Windows/system32')).toBeNull();
    expect(sanitizeRepoPath('')).toBeNull();
    expect(sanitizeRepoPath('a\0b')).toBeNull();
  });
});

describe('diffFileMaps', () => {
  it('separates created, updated and deleted paths', () => {
    const prev = { 'a.ts': '1', 'b.ts': '2', 'gone.ts': 'x' };
    const next = { 'a.ts': '1', 'b.ts': '3', 'new.ts': '4' };
    expect(diffFileMaps(prev, next)).toEqual({
      updated: { 'b.ts': '3' },
      created: { 'new.ts': '4' },
      deleted: ['gone.ts'],
    });
  });

  it('is empty when nothing changed', () => {
    const files = { 'a.ts': '1' };
    expect(diffFileMaps(files, { ...files })).toEqual({ updated: {}, created: {}, deleted: [] });
  });
});
