import { describe, expect, it } from 'vitest'
import { redactSecrets } from './secrets'

describe('redactSecrets', () => {
  it('redacts OpenAI-style keys', () => {
    expect(redactSecrets('key sk-abc123XYZ7890 here')).toBe('key sk-…redacted here')
  })

  it('redacts github tokens', () => {
    expect(redactSecrets('token ghp_abcdefgh1234567890')).toBe('token ghp-…redacted')
  })

  it('redacts bearer tokens and jwts', () => {
    expect(redactSecrets('Authorization: Bearer abcdefghijklmnop')).toBe(
      'Authorization: Bearer …redacted',
    )
    expect(redactSecrets('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJVadQssw0')).toBe(
      'eyJ…redacted',
    )
  })

  it('leaves normal text alone', () => {
    const s = 'build ok in 120ms, exit 0'
    expect(redactSecrets(s)).toBe(s)
  })
})
