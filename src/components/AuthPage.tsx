import React, { useState } from 'react';
import { Github, X, Mail } from 'lucide-react';
import {
  mudAuthConfigured,
  mudOAuthProviders,
  mudOAuthStart,
  mudRegister,
} from '../adapters/mudauth';

// A full-screen sign in / sign up page.
//
// Accounts are optional: the IDE works in local mode (your own machine, your
// own keys) and this page is the way in when you want cloud features.
// The look is deliberately quiet — one column, one action, no chrome.

interface AuthPageProps {
  onClose: () => void;
  onProviderSignIn?: (provider: 'github' | 'google' | 'email', email?: string) => Promise<{ name: string; email: string }>;
  onMagicLink?: (email: string) => Promise<string>;
  onSignedIn?: (user: { name: string; email: string }) => void;
  signInError?: string | null;
  authHint?: string | null;
  /** Shown when the user is already signed in. */
  signedInAs?: { name: string; email: string } | null;
}

const SOCIAL: Array<{ id: 'github' | 'google'; label: string; icon: React.ReactNode }> = [
  {
    id: 'google',
    label: 'Google',
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden>
        <path
          fill="#4285F4"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        />
        <path
          fill="#34A853"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        />
        <path
          fill="#FBBC05"
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
        />
        <path
          fill="#EA4335"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
        />
      </svg>
    ),
  },
  { id: 'github', label: 'GitHub', icon: <Github className="w-4 h-4" /> },
];

export const AuthPage: React.FC<AuthPageProps> = ({
  onClose,
  onProviderSignIn,
  onMagicLink,
  onSignedIn,
  signInError,
  authHint,
  signedInAs,
}) => {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [providers, setProviders] = useState<string[] | null>(null);
  const mudReady = mudAuthConfigured();

  React.useEffect(() => {
    if (!mudReady) return;
    void mudOAuthProviders()
      .then((list) => setProviders(list ?? ['github', 'google']))
      .catch(() => setProviders(['github', 'google']));
  }, [mudReady]);

  const socialProviders = mode === 'signup' && providers ? providers : SOCIAL.map((s) => s.id);

  const signInWithSocial = (provider: 'github' | 'google') => {
    if (mudReady && providers?.includes(provider)) {
      try {
        mudOAuthStart(provider);
        return;
      } catch (err) {
        setError((err as Error).message);
        return;
      }
    }
    if (!onProviderSignIn) {
      setError('Sign-in is not configured on this deployment.');
      return;
    }
    setBusy(true);
    setError(null);
    void onProviderSignIn(provider)
      .then((user) => onSignedIn?.(user))
      .catch((err) => setError((err as Error).message))
      .finally(() => setBusy(false));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const address = email.trim();
    if (!address || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === 'signup' && mudReady) {
        await mudRegister(address, password, name.trim() || undefined);
        setNotice('Account created — check your email to verify, then sign in.');
        setMode('signin');
        return;
      }
      if (mode === 'signup' && onMagicLink) {
        const msg = await onMagicLink(address);
        if (msg === 'SIGNED_IN') onSignedIn?.({ name: address.split('@')[0] ?? '', email: address });
        else setNotice(msg);
        return;
      }
      const send = onMagicLink
        ? onMagicLink(address)
        : onProviderSignIn
          ? onProviderSignIn('email', address).then(() => 'SIGNED_IN')
          : Promise.reject(new Error('Sign-in is not configured.'));
      const msg = await send;
      if (msg === 'SIGNED_IN') onSignedIn?.({ name: address.split('@')[0] ?? '', email: address });
      else setNotice(msg);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (signedInAs) {
    return (
      <div className="fixed inset-0 z-[60] bg-[#0b0b0c] text-neutral-100 flex flex-col">
        <AuthHeader onClose={onClose} />
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="w-full max-w-sm text-center space-y-4">
            <div className="w-11 h-11 mx-auto rounded-full bg-red-600 text-white flex items-center justify-center font-semibold">
              {(signedInAs.name ?? signedInAs.email ?? '?').slice(0, 1).toUpperCase()}
            </div>
            <div>
              <div className="text-lg font-semibold">{signedInAs.name || signedInAs.email}</div>
              <div className="text-[13px] text-neutral-500">{signedInAs.email}</div>
            </div>
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-[13px] font-medium transition-colors cursor-pointer"
            >
              Back to the editor
            </button>
          </div>
        </div>
        <AuthFooter />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] bg-[#0b0b0c] text-neutral-100 flex flex-col overflow-y-auto">
      <AuthHeader onClose={onClose} />

      <div className="flex-1 flex items-start justify-center px-6 pt-[12vh] pb-10">
        <div className="w-full max-w-[360px]">
          <h1 className="text-[26px] leading-tight font-semibold tracking-tight">
            Welcome to Zut
          </h1>
          <p className="text-[15px] text-neutral-500 mt-1">The local-first way to build software</p>

          <div className="flex gap-2 mt-7">
            {socialProviders.map((provider) => {
              const known = SOCIAL.find((s) => s.id === provider);
              return (
                <button
                  key={provider}
                  type="button"
                  disabled={busy}
                  title={known?.label ?? provider}
                  aria-label={known?.label ?? provider}
                  onClick={() => signInWithSocial(provider as 'github' | 'google')}
                  className="flex-1 h-11 rounded-lg bg-[#17171a] border border-[#26262b] hover:bg-[#1e1e22] flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
                >
                  {known?.icon ?? <span className="text-[12px] capitalize">{provider}</span>}
                </button>
              );
            })}
          </div>

          <div className="mt-7 space-y-1.5">
            <label htmlFor="auth-email" className="block text-[12px] text-neutral-400">
              Email
            </label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your email address"
              autoComplete="email"
              className="w-full h-10 px-3 rounded-lg bg-[#0f0f11] border border-[#26262b] text-[13px] placeholder:text-neutral-600 focus:outline-none focus:border-[#3a3a40]"
            />
            {mode === 'signup' && mudReady && (
              <>
                <label htmlFor="auth-name" className="block text-[12px] text-neutral-400 pt-2">
                  Name
                </label>
                <input
                  id="auth-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Display name (optional)"
                  autoComplete="name"
                  className="w-full h-10 px-3 rounded-lg bg-[#0f0f11] border border-[#26262b] text-[13px] placeholder:text-neutral-600 focus:outline-none focus:border-[#3a3a40]"
                />
                <label htmlFor="auth-password" className="block text-[12px] text-neutral-400 pt-2">
                  Password
                </label>
                <input
                  id="auth-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  className="w-full h-10 px-3 rounded-lg bg-[#0f0f11] border border-[#26262b] text-[13px] placeholder:text-neutral-600 focus:outline-none focus:border-[#3a3a40]"
                />
              </>
            )}
          </div>

          {notice && (
            <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-300">
              {notice}
            </div>
          )}
          {(error || signInError) && (
            <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
              {error ?? signInError}
            </div>
          )}
          {authHint && !notice && !error && !signInError && (
            <div className="mt-3 rounded-lg border border-[#26262b] bg-[#121214] px-3 py-2 text-[12px] text-neutral-400">
              {authHint}
            </div>
          )}

          <button
            type="button"
            onClick={(e) => void submit(e as unknown as React.FormEvent)}
            disabled={busy || !email.trim()}
            className="mt-4 w-full h-10 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white text-[13px] font-medium transition-colors cursor-pointer"
          >
            {busy ? 'Working…' : mode === 'signup' ? 'Create account' : 'Continue with email'}
          </button>

          <p className="mt-4 text-center text-[12px] text-neutral-500">
            {mode === 'signup' ? 'Already have an account? ' : "Don't have an account? "}
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'signup' ? 'signin' : 'signup');
                setError(null);
                setNotice(null);
              }}
              className="text-neutral-300 hover:text-white underline underline-offset-2 transition-colors cursor-pointer"
            >
              {mode === 'signup' ? 'Sign in' : 'Sign up'}
            </button>
          </p>

          <p className="mt-6 text-center text-[12px] text-neutral-600">
            Just using it locally?{' '}
            <button
              type="button"
              onClick={onClose}
              className="text-neutral-400 hover:text-neutral-200 underline underline-offset-2 transition-colors cursor-pointer"
            >
              Continue without an account
            </button>
          </p>
        </div>
      </div>

      <AuthFooter />
    </div>
  );
};

function AuthHeader({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex items-center justify-between px-6 py-5">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-md bg-red-600 text-white flex items-center justify-center text-[12px] font-bold">
          Z
        </div>
        <span className="text-[13px] font-semibold tracking-wide">ZUT</span>
      </div>
      <button
        onClick={onClose}
        aria-label="Close"
        className="text-neutral-500 hover:text-neutral-200 transition-colors cursor-pointer"
      >
        <X size={16} />
      </button>
    </div>
  );
}

function AuthFooter() {
  return (
    <div className="px-6 py-5 text-center text-[11px] text-neutral-600">
      <span>Terms of Service</span>
      <span className="mx-1.5">and</span>
      <span>Privacy Policy</span>
    </div>
  );
}
