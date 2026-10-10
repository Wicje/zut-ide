import { describe, expect, it, beforeEach } from 'vitest'
import {
  CONNECTOR_DEFS,
  clearConnectorKey,
  connectorsPromptBlock,
  getCloudinaryConfig,
  getConnectorKey,
  getSupabaseLink,
  isConnectorSet,
  setCloudinaryConfig,
  setConnectorKey,
  setSupabaseLink,
} from './connectors'
import { clearVercelToken } from '../adapters/providers'

beforeEach(() => {
  for (const d of CONNECTOR_DEFS) clearConnectorKey(d.id)
  clearVercelToken()
})

describe('dev-tool connectors', () => {
  it('stores single-value keys round-trip', () => {
    expect(isConnectorSet('github')).toBe(false)
    setConnectorKey('github', 'ghp_test')
    expect(getConnectorKey('github')).toBe('ghp_test')
    expect(isConnectorSet('github')).toBe(true)
    clearConnectorKey('github')
    expect(getConnectorKey('github')).toBe(null)
  })

  it('stores cloudinary config as JSON', () => {
    expect(getCloudinaryConfig()).toBe(null)
    setCloudinaryConfig('demo-cloud', 'demo-preset')
    expect(getCloudinaryConfig()).toEqual({ cloudName: 'demo-cloud', preset: 'demo-preset' })
  })

  it('stores supabase link as JSON', () => {
    setSupabaseLink('https://x.supabase.co', 'anon-test')
    expect(getSupabaseLink()).toEqual({ url: 'https://x.supabase.co', anon: 'anon-test' })
  })

  it('prompt block is empty when nothing connected, lists tools when set', () => {
    expect(connectorsPromptBlock()).toBe('')
    setConnectorKey('github', 'ghp_test')
    setSupabaseLink('https://x.supabase.co', 'anon-test')
    const b = connectorsPromptBlock()
    expect(b).toMatch(/GitHub/)
    expect(b).toMatch(/https:\/\/x\.supabase\.co/)
    expect(b).not.toMatch(/Vercel/)
  })
})
