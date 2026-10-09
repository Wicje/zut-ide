// FileMap <-> UI type bridges. Pure, no deps.
import type { DiffFile, DiffLine, ProjectFile } from '../types';
import { diffLines, diffStat } from './aiEdits';

export type FileMap = Record<string, string>;

const PYTHON_ENTRIES = ['main.py', 'app.py', 'index.py'];
const GO_ENTRIES = ['main.go'];

export type ProjectKind = 'web' | 'python' | 'go';

/** Same rule as zut-ide: index.html wins, else program entries, else web. */
export function detectProjectKind(files: FileMap): ProjectKind {
  if (files['index.html'] !== undefined) return 'web';
  for (const e of PYTHON_ENTRIES) if (files[e] !== undefined) return 'python';
  if (files['requirements.txt'] !== undefined) return 'python';
  for (const e of GO_ENTRIES) if (files[e] !== undefined) return 'go';
  if (files['go.mod'] !== undefined) return 'go';
  return 'web';
}

export function findProgramEntry(files: FileMap, kind: ProjectKind): string | null {
  if (kind === 'python') {
    for (const e of PYTHON_ENTRIES) if (files[e] !== undefined) return e;
    return Object.keys(files).find((f) => f.endsWith('.py')) ?? null;
  }
  if (kind === 'go') {
    for (const e of GO_ENTRIES) if (files[e] !== undefined) return e;
    return null;
  }
  return null;
}

export function languageForPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith('.tsx') || lower.endsWith('.ts') || lower.endsWith('.mts')) return 'typescript';
  if (lower.endsWith('.jsx') || lower.endsWith('.js') || lower.endsWith('.mjs')) return 'javascript';
  if (lower.endsWith('.css')) return 'css';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html';
  if (lower.endsWith('.py')) return 'python';
  if (lower.endsWith('.go')) return 'go';
  return 'plaintext';
}

let diffSeq = 0;

/** Build this UI's DiffFile list from a base/current FileMap pair, with real
 *  unified line numbers computed from the diff (not stored fixtures). */
export function buildDiffFiles(base: FileMap, current: FileMap, maxFiles = 50): DiffFile[] {
  const out: DiffFile[] = [];
  const names = [...new Set([...Object.keys(base), ...Object.keys(current)])].sort();
  for (const path of names) {
    const a = base[path] ?? '';
    const b = current[path] ?? '';
    if (a === b) continue;
    const parts = diffLines(a, b);
    const { added, removed } = diffStat(parts);
    let oldN = 0;
    let newN = 0;
    const lines: DiffLine[] = parts.map((p) => {
      if (p.type === 'same') {
        oldN += 1;
        newN += 1;
        return { id: `l${diffSeq++}`, oldLineNumber: oldN, newLineNumber: newN, type: 'context' as const, content: p.text };
      }
      if (p.type === 'remove') {
        oldN += 1;
        return { id: `l${diffSeq++}`, oldLineNumber: oldN, newLineNumber: '', type: 'delete' as const, content: p.text };
      }
      newN += 1;
      return { id: `l${diffSeq++}`, oldLineNumber: '', newLineNumber: newN, type: 'add' as const, content: p.text };
    });
    const status = a === '' ? ('added' as const) : b === '' ? ('deleted' as const) : ('modified' as const);
    out.push({ id: `d-${path}`, path, additions: added, deletions: removed, status, staged: false, lines });
    if (out.length >= maxFiles) break;
  }
  return out;
}

export function fileMapToProjectFiles(files: FileMap, isModified?: (path: string) => boolean): ProjectFile[] {
  return Object.keys(files)
    .sort()
    .map((path) => ({
      id: path,
      path,
      name: path.split('/').pop() ?? path,
      content: files[path],
      language: languageForPath(path),
      isModified: isModified?.(path),
    }));
}

export function projectFilesToFileMap(files: ProjectFile[]): FileMap {
  const out: FileMap = {};
  for (const f of files) out[f.path] = f.content;
  return out;
}
