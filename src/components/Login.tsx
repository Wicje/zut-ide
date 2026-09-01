import { useState } from 'react'
import { supabaseOrNull } from '../lib/supabase'

interface LoginProps {
  onClose: () => void
  onSignedIn: () => void
}

export default function Login({ onClose, onSignedIn }: LoginProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const supabase = supabaseOrNull()
      if (!supabase) throw new Error('Cloud accounts are not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env')
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        else {
          onClose()
          onSignedIn()
          return
        }
      }
      onClose()
      onSignedIn()
    } catch (err) {
      setError((err as { message?: string }).message ?? 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{mode === 'signin' ? 'Sign in' : 'Create account'}</h2>
        <form onSubmit={submit}>
          <label>
            Email
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </label>
          <label>
            Password
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            />
          </label>
          {error && <div className="form-error">{error}</div>}
          <button type="submit" className="btn primary" disabled={busy}>
            {busy ? '…' : mode === 'signin' ? 'Sign in' : 'Sign up'}
          </button>
        </form>
        <button className="link-btn" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
          {mode === 'signin' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  )
}