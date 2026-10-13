import { describe, expect, it } from 'vitest'
import { detectProjectKind, findProgramEntry } from './projectKind'
import { emptyProject } from './templates'

// No language presets: the agent writes any code directly. Detection still
// matters at run time, so these cases use inline file maps.
const PYTHON_FILES = { 'main.py': 'print("hi")' }
const GO_FILES = { 'main.go': 'package main' }

describe('projectKind', () => {
  it('detects web when index.html is present', () => {
    expect(detectProjectKind(emptyProject())).toBe('web')
    expect(detectProjectKind({ 'index.html': 'x', 'main.py': 'y' })).toBe('web')
  })

  it('detects python and go programs', () => {
    expect(detectProjectKind(PYTHON_FILES)).toBe('python')
    expect(detectProjectKind(GO_FILES)).toBe('go')
    expect(detectProjectKind({ 'requirements.txt': 'requests' })).toBe('python')
  })

  it('finds the right entry file', () => {
    expect(findProgramEntry(PYTHON_FILES, 'python')).toBe('main.py')
    expect(findProgramEntry(GO_FILES, 'go')).toBe('main.go')
    expect(findProgramEntry({}, 'python')).toBeNull()
  })
})
