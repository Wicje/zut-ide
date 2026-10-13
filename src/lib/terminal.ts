// P0/P2 terminal core: pure command helpers extracted from App.tsx so the
// shell stays thin and every branch is unit-tested. Async execution
// (runEntry, preview rebuild) stays in App and calls these for formatting.
import type { FileMap } from '../adapters/filemap';

export interface TermCtx {
  files: FileMap;
  projectName: string;
  kind: string;
  runs: number;
  broker: boolean;
}

export function parseCmd(cmd: string): { verb: string; args: string[] } {
  const [verb = '', ...args] = cmd.trim().split(/\s+/).filter(Boolean);
  return { verb: verb.toLowerCase(), args };
}

export function termHelp(): string[] {
  return [
    'Commands: run [entry], status, ls [prefix], cat <file>, open <file>, help',
    'run — preview web, execute programs via the broker',
    'ls — list workspace files (optional path prefix)',
    'cat — print a file (first 40 lines)',
    'open — jump to a file in the editor',
  ];
}

export function termStatus(ctx: TermCtx): string[] {
  return [
    `Project ${ctx.projectName} (${ctx.kind}, ${Object.keys(ctx.files).length} files)`,
    `${ctx.runs} runs recorded this session`,
    ctx.broker ? 'Broker: connected' : 'Broker: not configured (VITE_BROKER_URL)',
  ];
}

export function termLs(files: FileMap, prefix = ''): string[] {
  const names = Object.keys(files).sort().filter((p) => !prefix || p.startsWith(prefix));
  if (names.length === 0) return [prefix ? `No files under "${prefix}".` : 'Workspace is empty.'];
  return names.slice(0, 100).map((p) => `${p} (${files[p].length}b)`);
}

export function termCat(files: FileMap, target: string): string[] {
  if (!target) return ['Usage: cat <file>'];
  const hit = Object.keys(files).find((p) => p === target) ?? Object.keys(files).find((p) => p.endsWith(target));
  if (!hit) return [`No such file: ${target}`];
  const content = files[hit];
  if (/^data:image\//.test(content.slice(0, 32))) return [`${hit}: binary image (${content.length}b) — use open.`];
  const lines = content.split('\n').slice(0, 40);
  const out = [`--- ${hit} ---`, ...lines];
  if (content.split('\n').length > 40) out.push(`… (${content.split('\n').length - 40} more lines — open in editor)`);
  return out;
}

export function termOpen(files: FileMap, target: string): { path: string | null; lines: string[] } {
  if (!target) return { path: null, lines: ['Usage: open <file>'] };
  const hit = Object.keys(files).find((p) => p === target) ?? Object.keys(files).find((p) => p.endsWith(target));
  if (!hit) return { path: null, lines: [`No such file: ${target}`] };
  return { path: hit, lines: [`Opened ${hit} in the editor.`] };
}
