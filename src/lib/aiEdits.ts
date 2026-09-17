export interface ProposedEdit {
  path: string
  content: string
  exists: boolean
}

export type DiffLineType = 'same' | 'add' | 'remove'

export interface DiffLine {
  type: DiffLineType
  text: string
}

const EDIT_BLOCK = /```[ \t]*edit:([^\n`]+)\r?\n([\s\S]*?)```/g

/** Extract fenced ```edit:<path> blocks the model was instructed to emit. */
export function parseEdits(text: string, files: Record<string, string>): ProposedEdit[] {
  const edits: ProposedEdit[] = []
  const seen = new Set<string>()
  EDIT_BLOCK.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = EDIT_BLOCK.exec(text)) !== null) {
    const path = match[1].trim()
    const content = match[2].replace(/\n$/, '')
    if (!path || seen.has(path)) continue
    seen.add(path)
    edits.push({ path, content, exists: path in files })
  }
  return edits
}

/** Remove edit blocks from the prose shown in the chat transcript (they're
 *  rendered as reviewable proposal cards instead). */
export function stripEditBlocks(text: string): string {
  return text.replace(EDIT_BLOCK, '').replace(/\n{3,}/g, '\n\n').trim()
}

/** Line-level diff via a simple LCS table. Fine for the file sizes in an IDE
 *  of this scale; returns an ordered list of unchanged/added/removed lines. */
export function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = oldText.length ? oldText.split('\n') : []
  const b = newText.length ? newText.split('\n') : []
  const n = a.length
  const m = b.length

  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: 'same', text: a[i] })
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ type: 'remove', text: a[i] })
      i++
    } else {
      out.push({ type: 'add', text: b[j] })
      j++
    }
  }
  while (i < n) out.push({ type: 'remove', text: a[i++] })
  while (j < m) out.push({ type: 'add', text: b[j++] })
  return out
}

/** Count added / removed lines, for a compact summary badge. */
export function diffStat(lines: DiffLine[]): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const line of lines) {
    if (line.type === 'add') added++
    else if (line.type === 'remove') removed++
  }
  return { added, removed }
}
