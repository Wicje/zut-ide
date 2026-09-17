import { describe, expect, it } from 'vitest'
import { diffLines, diffStat, parseEdits, stripEditBlocks } from './aiEdits'

const FILES = {
  'style.css': 'body { color: black; }',
  'app.js': 'console.log("hi")',
}

describe('parseEdits', () => {
  it('extracts a single edit block and flags existing files', () => {
    const text = 'Here you go:\n```edit:style.css\nbody { color: red; }\n```\nDone.'
    const edits = parseEdits(text, FILES)
    expect(edits).toHaveLength(1)
    expect(edits[0]).toMatchObject({ path: 'style.css', content: 'body { color: red; }', exists: true })
  })

  it('marks new files as not existing', () => {
    const edits = parseEdits('```edit:new.js\n1\n```', FILES)
    expect(edits).toHaveLength(1)
    expect(edits[0].exists).toBe(false)
  })

  it('collects multiple blocks and dedupes repeat paths', () => {
    const text = '```edit:a.js\n1\n```\n```edit:b.js\n2\n```\n```edit:a.js\n3\n```'
    const edits = parseEdits(text, {})
    expect(edits.map((e) => e.path)).toEqual(['a.js', 'b.js'])
  })

  it('returns an empty list when the model sends prose only', () => {
    expect(parseEdits('No changes needed.', FILES)).toEqual([])
  })

  it('ignores blocks with an empty path', () => {
    expect(parseEdits('```edit:   \nx\n```', FILES)).toEqual([])
  })
})

describe('stripEditBlocks', () => {
  it('removes edit blocks but keeps the prose', () => {
    const out = stripEditBlocks('Intro\n```edit:a.js\ncode\n```\nOutro')
    expect(out).toContain('Intro')
    expect(out).toContain('Outro')
    expect(out).not.toContain('edit:a.js')
  })
})

describe('diffLines', () => {
  it('marks changed lines as add/remove and keeps the rest', () => {
    const lines = diffLines('a\nb\nc', 'a\nB\nc\nd')
    const { added, removed } = diffStat(lines)
    expect(added).toBe(2)
    expect(removed).toBe(1)
    expect(lines.filter((l) => l.type === 'same').map((l) => l.text)).toEqual(['a', 'c'])
  })

  it('handles an empty before-file as all added', () => {
    const { added, removed } = diffStat(diffLines('', 'x\ny'))
    expect(added).toBe(2)
    expect(removed).toBe(0)
  })
})
