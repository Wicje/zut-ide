import { describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isKept, listFiles, mirrorPlan, safePath, writeMirror } from './bridge-files.mjs';

async function tempDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'zut-bridge-'));
}

describe('safePath', () => {
  it('rejects paths that escape the workspace', () => {
    expect(safePath('../secrets')).toBeNull();
    expect(safePath('/etc/passwd')).toBeNull();
    expect(safePath('')).toBeNull();
    expect(safePath('.')).toBeNull();
  });

  it('keeps ordinary project paths', () => {
    expect(safePath('src/app.ts')).toBe('src/app.ts');
    expect(safePath('index.html')).toBe('index.html');
  });
});

describe('isKept', () => {
  it('never touches dot files, .git or node_modules', () => {
    expect(isKept('.git')).toBe(true);
    expect(isKept('.git/config')).toBe(true);
    expect(isKept('.env')).toBe(true);
    expect(isKept('node_modules/react/index.js')).toBe(true);
    expect(isKept('src/app.ts')).toBe(false);
  });
});

describe('mirrorPlan', () => {
  it('removes what is not in the project', () => {
    expect(mirrorPlan(['a.ts', 'old.ts'], { 'a.ts': 'x' })).toEqual(['old.ts']);
  });

  it('keeps dot files and .git', () => {
    expect(mirrorPlan(['.env', 'old.ts'], { 'a.ts': 'x' })).toEqual(['old.ts']);
  });

  it('removes nothing when the project matches', () => {
    expect(mirrorPlan(['a.ts', 'b.ts'], { 'a.ts': 'x', 'b.ts': 'y' })).toEqual([]);
  });
});

describe('writeMirror', () => {
  it('makes the workspace an exact copy of the project', async () => {
    const root = await tempDir();
    try {
      await writeMirror(root, { 'index.html': '<h1>hi</h1>', 'src/app.ts': 'export {}' });
      expect(await listFiles(root)).toEqual(['index.html', 'src/app.ts']);

      // a new project replaces the old one completely
      const removed = await writeMirror(root, { 'main.py': 'print(1)' });
      expect(removed).toEqual(['index.html', 'src/app.ts']);
      expect(await listFiles(root)).toEqual(['main.py']);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('never removes .git or dot files', async () => {
    const root = await tempDir();
    try {
      await fs.mkdir(path.join(root, '.git'), { recursive: true });
      await fs.writeFile(path.join(root, '.git', 'HEAD'), 'ref: refs/heads/main');
      await fs.writeFile(path.join(root, '.env'), 'SECRET=1');
      await writeMirror(root, { 'a.ts': 'x' });
      expect(await listFiles(root)).toEqual(['a.ts']);
      expect(await fs.readFile(path.join(root, '.git', 'HEAD'), 'utf8')).toBe('ref: refs/heads/main');
      expect(await fs.readFile(path.join(root, '.env'), 'utf8')).toBe('SECRET=1');
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('refuses a path that escapes the workspace', async () => {
    const root = await tempDir();
    try {
      await expect(writeMirror(root, { '../escape.txt': 'nope' })).rejects.toThrow(/unsafe path/);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
