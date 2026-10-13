import { describe, expect, it } from 'vitest'
import { parseCmd, termCat, termHelp, termLs, termOpen, termStatus } from './terminal'

const FILES = { 'index.html': '<h1>hi</h1>', 'script.js': 'a\nb\nc', 'img.png': 'data:image/png;base64,AAAA' }

describe('terminal core', () => {
  it('parses verbs case-insensitively', () => {
    expect(parseCmd('  RUN main.py ')).toEqual({ verb: 'run', args: ['main.py'] })
    expect(parseCmd('')).toEqual({ verb: '', args: [] })
  })

  it('lists and filters files', () => {
    expect(termLs(FILES)).toHaveLength(3)
    expect(termLs(FILES, 'script')[0]).toMatch(/^script\.js/)
    expect(termLs({}, '')).toEqual(['Workspace is empty.'])
  })

  it('cats text and refuses binary', () => {
    expect(termCat(FILES, 'script.js')[0]).toBe('--- script.js ---')
    expect(termCat(FILES, 'img.png')[0]).toMatch(/binary image/)
    expect(termCat(FILES, 'nope')).toEqual(['No such file: nope'])
    expect(termCat(FILES, '')).toEqual(['Usage: cat <file>'])
  })

  it('resolves open targets', () => {
    expect(termOpen(FILES, 'script.js').path).toBe('script.js')
    expect(termOpen(FILES, 'js').path).toBe('script.js')
    expect(termOpen(FILES, 'nope').path).toBeNull()
  })

  it('reports status and help', () => {
    expect(termStatus({ files: FILES, projectName: 'demo', kind: 'web', runs: 2, broker: false })).toHaveLength(3)
    expect(termHelp()[0]).toMatch(/Commands:/)
  })
})
