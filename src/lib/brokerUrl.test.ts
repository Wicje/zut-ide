import { describe, expect, it } from 'vitest'
import { resolveBrokerUrl } from './brokerUrl'

describe('resolveBrokerUrl', () => {
  it('prefers the canonical VITE_BROKER_URL', () => {
    expect(
      resolveBrokerUrl({ VITE_BROKER_URL: 'https://broker.example', VITE_RUNTIME_URL: 'https://old.example' }),
    ).toBe('https://broker.example')
  })

  it('falls back to the legacy VITE_RUNTIME_URL', () => {
    expect(resolveBrokerUrl({ VITE_RUNTIME_URL: 'http://127.0.0.1:8787/' })).toBe(
      'http://127.0.0.1:8787',
    )
  })

  it('treats blank values as unconfigured', () => {
    expect(resolveBrokerUrl({})).toBe('')
    expect(resolveBrokerUrl({ VITE_BROKER_URL: '  ', VITE_RUNTIME_URL: '' })).toBe('')
  })

  it('trims trailing slashes exactly once', () => {
    expect(resolveBrokerUrl({ VITE_BROKER_URL: 'https://broker.example///' })).toBe(
      'https://broker.example',
    )
  })
})
