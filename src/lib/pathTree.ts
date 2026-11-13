// Build a collapsible folder tree from flat file paths.

export interface PathTreeNode {
  /** Folder name or file name. */
  name: string;
  /** Full path for files; folder prefix for folders. */
  path: string;
  kind: 'folder' | 'file';
  children: PathTreeNode[];
  /** File changed vs the review baseline (files only). */
  dirty?: boolean;
}

function byDirtyThenName(a: PathTreeNode, b: PathTreeNode): number {
  const ad = a.dirty ? 0 : 1;
  const bd = b.dirty ? 0 : 1;
  if (ad !== bd) return ad - bd;
  // Folders before files, then name.
  if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1;
  return a.name.localeCompare(b.name);
}

/** Tree for the given paths, dirs first, dirty files first within each level. */
export function buildPathTree(
  paths: string[],
  dirtyOf: (path: string) => boolean = () => false,
): PathTreeNode[] {
  const roots: PathTreeNode[] = [];
  const folders = new Map<string, PathTreeNode>();
  const folderFor = (seg: string, parts: string[], depth: number): PathTreeNode => {
    const prefix = parts.slice(0, depth + 1).join('/');
    let node = folders.get(prefix);
    if (!node) {
      node = { name: seg, path: prefix, kind: 'folder', children: [] };
      folders.set(prefix, node);
      if (depth === 0) roots.push(node);
      else folderFor(parts[depth - 1], parts, depth - 1).children.push(node);
    }
    return node;
  };
  for (const path of paths) {
    const parts = path.split('/').filter(Boolean);
    if (parts.length === 0) continue;
    const fileName = parts[parts.length - 1];
    if (parts.length === 1) {
      roots.push({ name: fileName, path, kind: 'file', children: [], dirty: dirtyOf(path) });
      continue;
    }
    for (let d = 0; d < parts.length - 1; d += 1) {
      folderFor(parts[d], parts, d);
    }
    folders.get(parts.slice(0, parts.length - 1).join('/'))!.children.push({
      name: fileName,
      path,
      kind: 'file',
      children: [],
      dirty: dirtyOf(path),
    });
  }
  const sortRec = (nodes: PathTreeNode[]) => {
    nodes.sort(byDirtyThenName);
    for (const n of nodes) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}

/** Filter rows by a case-insensitive substring; keeps folders whose
 *  descendants match, drops the rest. */
export function filterTree(nodes: PathTreeNode[], query: string): PathTreeNode[] {
  if (!query) return nodes;
  const q = query.toLowerCase();
  const walk = (list: PathTreeNode[]): PathTreeNode[] =>
    list
      .map((n) => {
        if (n.kind === 'file') return n.path.toLowerCase().includes(q) ? n : null;
        const children = walk(n.children);
        if (n.path.toLowerCase().includes(q) || children.length > 0) {
          return { ...n, children };
        }
        return null;
      })
      .filter((n): n is PathTreeNode => n !== null);
  return walk(nodes);
}

/** Flat visible rows after collapsing, capped for huge trees. */
export interface FlatRow {
  node: PathTreeNode;
  depth: number;
}

export function flattenTree(
  nodes: PathTreeNode[],
  collapsed: Record<string, boolean>,
  cap = 400,
): { rows: FlatRow[]; hidden: number } {
  const rows: FlatRow[] = [];
  let hidden = 0;
  const walk = (list: PathTreeNode[], depth: number) => {
    for (const n of list) {
      if (rows.length >= cap) {
        hidden += 1;
        continue;
      }
      rows.push({ node: n, depth });
      if (n.kind === 'folder' && !collapsed[n.path]) walk(n.children, depth + 1);
    }
  };
  walk(nodes, 0);
  return { rows, hidden };
}

export function countFiles(nodes: PathTreeNode[]): number {
  let n = 0;
  for (const node of nodes) n += node.kind === 'file' ? 1 : countFiles(node.children);
  return n;
}
