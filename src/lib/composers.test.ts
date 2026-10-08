import { describe, expect, it, beforeEach } from 'vitest'
import { clearComposersForTests, clearMessages, loadMessages, loadSessions, saveMessages } from './composers'

beforeEach(() => {
  clearComposersForTests()
})

describe('composer sessions', () => {
  it('starts empty and persists messages per session', () => {
    expect(loadSessions()).toEqual([])
    saveMessages('a', [{ role: 'user', content: 'hi' }])
    expect(loadMessages('a')).toEqual([{ role: 'user', content: 'hi' }])
    expect(loadMessages('b')).toEqual([])
  })

  it('caps history at 100 messages', () => {
    const many = Array.from({ length: 150 }, (_, i) => ({ role: 'user' as const, content: `m${i}` }))
    saveMessages('a', many)
    const back = loadMessages('a')
    expect(back.length).toBe(100)
    expect(back[0].content).toBe('m50')
  })

  it('clears a session without touching others', () => {
    saveMessages('a', [{ role: 'user', content: 'hi' }])
    saveMessages('b', [{ role: 'assistant', content: 'yo' }])
    clearMessages('a')
    expect(loadMessages('a')).toEqual([])
    expect(loadMessages('b')).toEqual([{ role: 'assistant', content: 'yo' }])
  })
})
