import type { FileMap } from '../types'

export type ProjectKind = 'web' | 'python' | 'go'

const PYTHON_ENTRIES = ['main.py', 'app.py', 'index.py']
const GO_ENTRIES = ['main.go']

/** Detect what kind of project this is from its files.
 *  - `index.html` present -> web (current behavior, unchanged)
 *  - else `main.py`/`app.py`/`index.py` -> python
 *  - else `main.go`/`go.mod` -> go
 *  - else web fallback (empty project still boots the web canvas)
 */
export function detectProjectKind(files: FileMap): ProjectKind {
  if (files['index.html'] !== undefined) return 'web'
  for (const e of PYTHON_ENTRIES) if (files[e] !== undefined) return 'python'
  if (files['requirements.txt'] !== undefined) return 'python'
  for (const e of GO_ENTRIES) if (files[e] !== undefined) return 'go'
  if (files['go.mod'] !== undefined) return 'go'
  return 'web'
}

/** Entry file to execute for non-web projects. */
export function findProgramEntry(files: FileMap, kind: ProjectKind): string | null {
  if (kind === 'python') {
    for (const e of PYTHON_ENTRIES) if (files[e] !== undefined) return e
    const anyPy = Object.keys(files).find((f) => f.endsWith('.py'))
    return anyPy ?? null
  }
  if (kind === 'go') {
    for (const e of GO_ENTRIES) if (files[e] !== undefined) return e
    return null
  }
  return null
}

export const KIND_LABEL: Record<ProjectKind, string> = {
  web: 'Web',
  python: 'Python',
  go: 'Go',
}

export const KIND_ENTRY_HINT: Record<ProjectKind, string> = {
  web: 'index.html',
  python: 'main.py',
  go: 'main.go',
}
