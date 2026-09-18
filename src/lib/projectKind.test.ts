import { describe, expect, it } from 'vitest'
import { detectProjectKind, findProgramEntry } from './projectKind'
import { pythonStarter, goStarter, emptyProject } from './templates'

describe('projectKind', () => {
  it('detects web when index.html is present', () => {
    expect(detectProjectKind(emptyProject())).toBe('web')
    expect(detectProjectKind({ 'index.html': 'x', 'main.py': 'y' })).toBe('web')
  })

  it('detects python and go programs', () => {
    expect(detectProjectKind(pythonStarter())).toBe('python')
    expect(detectProjectKind(goStarter())).toBe('go')
    expect(detectProjectKind({ 'requirements.txt': 'requests' })).toBe('python')
  })

  it('finds the right entry file', () => {
    expect(findProgramEntry(pythonStarter(), 'python')).toBe('main.py')
    expect(findProgramEntry(goStarter(), 'go')).toBe('main.go')
    expect(findProgramEntry({}, 'python')).toBeNull()
  })
})
