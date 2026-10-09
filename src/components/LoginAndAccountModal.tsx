import React, { useState } from 'react';
import {
  mudAuthConfigured,
  mudLogin,
  mudRegister,
  mudResetPassword,
  mudMagicLink,
  mudOAuthProviders,
  mudOAuthStart,
} from '../adapters/mudauth';
import {
  X,
  Check,
  Shield,
  Zap,
  Users,
  Key,
  LogOut,
  Mail,
  Github,
  Sparkles,
  ArrowRight,
  Sliders,
} from 'lucide-react';
import avatarImg from '../assets/images/sualeh_avatar_1791421944193.jpg';

interface LoginAndAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: {
    name: string;
    email: string;
    plan: string;
    avatar: string;
    fastRequestsUsed: number;
    fastRequestsLimit: number;
  };
  onLoginSuccess?: (user: { name: string; email: string }) => void;
  onLogout?: () => void;
  theme?: 'light' | 'dark';
  /** Real sign-in channel. Resolves with the signed-in user. */
  onProviderSignIn?: (provider: 'github' | 'google' | 'email', email?: string) => Promise<{ name: string; email: string }>;
  /** Magic-link channel. Resolves with the confirmation notice to display. */
  onMagicLink?: (email: string) => Promise<string>;
  signInError?: string | null;
  /** Shown when auth has no backend (self-hosted mode hint). */
  authHint?: string | null;
  teamLine?: string;
  resetLine?: string;
  geminiKeySet?: boolean;
  onSaveGeminiKey?: (key: string) => void;
  onClearGeminiKey?: () => void;
  providerKeys?: Record<string, boolean>;
  onSaveProviderKey?: (provider: 'openrouter' | 'anthropic' | 'chatgpt', key: string) => void;
  onClearProviderKey?: (provider: 'openrouter' | 'anthropic' | 'chatgpt') => void;
  quotaLine?: string | null;
}

const EXTRA_KEY_ROWS: Array<{
  id: 'openrouter' | 'anthropic' | 'chatgpt';
  label: string;
  placeholder: string;
}> = [
  { id: 'openrouter', label: 'OpenRouter', placeholder: 'sk-or-… (one key, many models)' },
  { id: 'anthropic', label: 'Anthropic', placeholder: 'sk-ant-… (console.anthropic.com)' },
  { id: 'chatgpt', label: 'OpenAI', placeholder: 'sk-… (platform.openai.com)' },
];

function ProviderKeyRow({
  label,
  placeholder,
  saved,
  input,
  onInput,
  onSave,
  onClear,
}: {
  label: string;
  placeholder: string;
  saved: boolean;
  input: string;
  onInput: (v: string) => void;
  onSave: (key: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  if (saved) {
    return (
      <div className="flex items-center justify-between rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-1.5">
        <span className="text-[11px] text-emerald-600 dark:text-emerald-400">{label} key saved in this browser</span>
        <button
          className="text-[11px] text-neutral-500 underline-offset-2 hover:underline"
          onClick={onClear}
        >
          Remove
        </button>
      </div>
    );
  }
  if (!open) {
    return (
      <button
        className="w-full text-left text-[11px] text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 px-0.5"
        onClick={() => setOpen(true)}
      >
        + Add {label} key
      </button>
    );
  }
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-medium text-neutral-600 dark:text-neutral-300">{label}</div>
      <div className="flex items-center gap-2">
        <input
          type="password"
          value={input}
          onChange={(e) => onInput(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className="h-8 flex-1 rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button
          className="h-8 px-2.5 rounded-md bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-[11px] font-semibold disabled:opacity-40"
          disabled={!input.trim()}
          onClick={() => {
            onSave(input.trim());
            setOpen(false);
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}

export const LoginAndAccountModal: React.FC<LoginAndAccountModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onLoginSuccess,
  onLogout,
  theme = 'light',
  onProviderSignIn,
  onMagicLink,
  signInError,
  authHint,
  teamLine,
  resetLine,
  geminiKeySet,
  onSaveGeminiKey,
  onClearGeminiKey,
  providerKeys,
  onSaveProviderKey,
  onClearProviderKey,
  quotaLine,
}) => {
  const isDark = theme === 'dark';
  const [activeTab, setActiveTab] = useState<'account' | 'signin' | 'mudbase'>('account');
  const mudReady = mudAuthConfigured();
  const [mudMode, setMudMode] = useState<'signin' | 'register' | 'reset'>('signin');
  const [mudEmail, setMudEmail] = useState('');
  const [mudPassword, setMudPassword] = useState('');
  const [mudName, setMudName] = useState('');
  const [mudError, setMudError] = useState<string | null>(null);
  const [oauthProviders, setOauthProviders] = useState<string[] | null>(null);
  const [oauthLoading, setOauthLoading] = useState(false);

  React.useEffect(() => {
    if (activeTab === 'mudbase' && mudReady && oauthProviders === null && !oauthLoading) {
      setOauthLoading(true);
      mudOAuthProviders()
        .then((list) => setOauthProviders(list ?? ['github', 'google']))
        .catch(() => setOauthProviders(['github', 'google']))
        .finally(() => setOauthLoading(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);
  const [emailInput, setEmailInput] = useState('');
  const [customApiKeyEnabled, setCustomApiKeyEnabled] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (!isOpen) return null;

  const usagePercent = Math.round(
    (currentUser.fastRequestsUsed / Math.max(1, currentUser.fastRequestsLimit)) * 100
  );

  const handleDemoSignIn = (provider: 'github' | 'google' | 'email') => {
    if (provider === 'email') {
      void handleMagicLink();
      return;
    }
    if (!onProviderSignIn) return;
    setBusy(true);
    setNotice(null);
    void onProviderSignIn(provider)
      .then((user) => {
        onLoginSuccess?.(user);
        setActiveTab('account');
      })
      .catch(() => {
        /* error surfaces via signInError prop */
      })
      .finally(() => setBusy(false));
  };

  const toUser = (email: string, name?: string) => ({
    name: name?.trim() || email.split('@')[0],
    email,
  });

  async function handleMudSubmit(e: React.FormEvent) {
    e.preventDefault();
    const email = mudEmail.trim();
    if (!email || busy) return;
    setBusy(true);
    setNotice(null);
    setMudError(null);
    try {
      if (mudMode === 'reset') {
        setNotice(await mudResetPassword(email));
      } else if (mudMode === 'register') {
        if (!mudPassword) throw new Error('Choose a password.');
        await mudRegister(email, mudPassword, mudName.trim() || undefined);
        setNotice('Account created — check your email to verify, then sign in.');
        setMudMode('signin');
      } else {
        if (!mudPassword) throw new Error('Enter your password.');
        const u = await mudLogin(email, mudPassword);
        onLoginSuccess?.(toUser(u.email, u.name));
        setMudPassword('');
        setActiveTab('account');
      }
    } catch (err) {
      setMudError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const handleMagicLink = () => {
    const email = emailInput.trim();
    if (!email || busy) return;
    setBusy(true);
    setNotice(null);
    const send = onMagicLink
      ? onMagicLink(email)
      : (onProviderSignIn
          ? onProviderSignIn('email', email).then(() => 'Signed in.')
          : Promise.reject(new Error('Sign-in is not configured.')));
    void send
      .then((msg) => {
        // A fresh session means we are signed in; otherwise show the notice
        // (e.g. "check your email") and stay on this tab.
        if (msg === 'SIGNED_IN') {
          setActiveTab('account');
        } else {
          setNotice(msg);
        }
      })
      .catch(() => {
        /* error surfaces via signInError prop */
      })
      .finally(() => setBusy(false));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-md rounded-2xl shadow-2xl border overflow-hidden ${
          isDark
            ? 'bg-[#18181c] border-neutral-700 text-neutral-100'
            : 'bg-white border-neutral-200 text-neutral-800'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Tabs */}
        <div
          className={`h-11 px-4 border-b flex items-center justify-between ${
            isDark ? 'border-neutral-800 bg-[#1f1f25]' : 'border-neutral-200 bg-neutral-50'
          }`}
        >
          <div className="flex items-center gap-3 text-xs font-medium">
            <button
              onClick={() => setActiveTab('account')}
              className={`pb-0.5 transition-colors cursor-pointer ${
                activeTab === 'account'
                  ? 'border-b-2 border-blue-500 font-semibold text-neutral-900 dark:text-white'
                  : 'text-neutral-400 hover:text-neutral-700'
              }`}
            >
              Account & Usage
            </button>
            <button
              onClick={() => setActiveTab('signin')}
              className={`pb-0.5 transition-colors cursor-pointer ${
                activeTab === 'signin'
                  ? 'border-b-2 border-blue-500 font-semibold text-neutral-900 dark:text-white'
                  : 'text-neutral-400 hover:text-neutral-700'
              }`}
            >
              Sign In Portal
            </button>
            {mudReady && (
              <button
                onClick={() => setActiveTab('mudbase')}
                className={`pb-0.5 transition-colors cursor-pointer ${
                  activeTab === 'mudbase'
                    ? 'border-b-2 border-blue-500 font-semibold text-neutral-900 dark:text-white'
                    : 'text-neutral-400 hover:text-neutral-700'
                }`}
              >
                Mudbase
              </button>
            )}
          </div>

          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 p-1"
          >
            <X size={15} />
          </button>
        </div>

        {/* Tab 1: Account & Usage Details */}
        {activeTab === 'account' && (
          <div className="p-4 space-y-4 text-xs">
            {/* User Profile Card */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-50 dark:bg-[#222228] border border-neutral-200 dark:border-neutral-700">
              <div className="flex items-center gap-3">
                <img
                  src={currentUser.avatar || avatarImg}
                  alt={currentUser.name}
                  className="w-10 h-10 rounded-full object-cover ring-2 ring-blue-500/30"
                />
                <div>
                  <div className="font-semibold text-sm leading-tight">
                    {currentUser.name}
                  </div>
                  <div className="text-[11px] text-neutral-500">
                    {currentUser.email}
                  </div>
                </div>
              </div>

              <span className="px-2 py-0.5 bg-blue-600 text-white rounded text-[10px] font-semibold tracking-wide uppercase">
                {currentUser.plan}
              </span>
            </div>

            {/* Usage Quota Meter */}
            <div className="space-y-1.5 p-3 rounded-xl border border-neutral-200 dark:border-neutral-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-medium">
                  <Zap size={13} className="text-amber-500" />
                  <span>Fast Model Requests</span>
                </div>
                <span className="font-mono text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                  {currentUser.fastRequestsUsed} / {currentUser.fastRequestsLimit}
                </span>
              </div>

              <div className="w-full h-2 bg-neutral-200 dark:bg-neutral-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all"
                  style={{ width: `${usagePercent}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[10.5px] text-neutral-400 pt-0.5">
                <span>{resetLine ?? 'Resets monthly'}</span>
                <span>{usagePercent}% utilized</span>
              </div>
              {quotaLine && (
                <div className="text-[10.5px] text-neutral-500 font-mono">{quotaLine}</div>
              )}
            </div>

            {/* Team & Workspace */}
            <div className="flex items-center justify-between p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700">
              <div className="flex items-center gap-2">
                <Users size={14} className="text-neutral-400" />
                <span className="font-medium">Team Workspace</span>
              </div>
              <span className="text-neutral-500 font-mono text-[11px]">
                {teamLine ?? 'Personal workspace'}
              </span>
            </div>

            {/* API Keys Configuration Toggle */}
            <div className="p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Key size={14} className="text-neutral-400" />
                  <div>
                    <div className="font-medium">Custom API Keys</div>
                    <div className="text-[10px] text-neutral-400">Your Gemini key, stored only in this browser</div>
                  </div>
                </div>
                <button
                  onClick={() => setCustomApiKeyEnabled(!customApiKeyEnabled)}
                  className={`w-8 h-4 rounded-full transition-colors relative cursor-pointer ${
                    customApiKeyEnabled ? 'bg-blue-600' : 'bg-neutral-300 dark:bg-neutral-700'
                  }`}
                >
                  <div
                    className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-transform ${
                      customApiKeyEnabled ? 'right-0.5' : 'left-0.5'
                    }`}
                  />
                </button>
              </div>
              {customApiKeyEnabled && (
                <div className="space-y-2">
                  <ProviderKeyRow
                    label="Gemini"
                    placeholder="AIza… (Google AI Studio key)"
                    saved={geminiKeySet ?? false}
                    input={keyInput}
                    onInput={setKeyInput}
                    onSave={(k) => {
                      onSaveGeminiKey?.(k);
                      setKeyInput('');
                    }}
                    onClear={() => onClearGeminiKey?.()}
                  />
                  {EXTRA_KEY_ROWS.map((row) => (
                    <ProviderKeyRow
                      key={row.id}
                      label={row.label}
                      placeholder={row.placeholder}
                      saved={providerKeys?.[row.id] ?? false}
                      input={keyInput}
                      onInput={setKeyInput}
                      onSave={(k) => {
                        onSaveProviderKey?.(row.id, k);
                        setKeyInput('');
                      }}
                      onClear={() => onClearProviderKey?.(row.id)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Bottom Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-neutral-200 dark:border-neutral-800">
              <button
                onClick={() => {
                  if (onLogout) onLogout();
                  setActiveTab('signin');
                }}
                className="flex items-center gap-1.5 text-neutral-400 hover:text-red-500 transition-colors text-[11.5px] cursor-pointer"
              >
                <LogOut size={12} />
                <span>Sign Out</span>
              </button>

              <button
                onClick={onClose}
                className="px-3.5 py-1.5 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 rounded-lg font-medium text-xs shadow-xs cursor-pointer hover:opacity-90"
              >
                Close Settings
              </button>
            </div>
          </div>
        )}
        {activeTab === 'signin' && (
          /* Tab 2: Sign In / Authentication Portal */
          <div className="p-5 space-y-4 text-xs">
            <div className="text-center space-y-1">
              <div className="w-10 h-10 rounded-xl bg-black dark:bg-white text-white dark:text-black mx-auto flex items-center justify-center font-bold text-base shadow-sm">
                C
              </div>
              <h3 className="font-bold text-base mt-2">Sign in to Cursor</h3>
              <p className="text-xs text-neutral-500">
                Synchronize your Composer agent sessions, custom rules, and cloud settings.
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <button
                onClick={() => handleDemoSignIn('github')}
                disabled={busy}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border border-neutral-300 dark:border-neutral-700 font-semibold text-xs hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Github size={15} />
                <span>{busy ? 'Working…' : 'Continue with GitHub'}</span>
              </button>

              <button
                disabled={busy}
                onClick={() => handleDemoSignIn('google')}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border border-neutral-300 dark:border-neutral-700 font-semibold text-xs hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
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
                <span>Continue with Google</span>
              </button>
            </div>

            <div className="flex items-center gap-2 my-2">
              <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-800" />
              <span className="text-[10.5px] text-neutral-400">or with email</span>
              <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-800" />
            </div>

            {authHint && !signInError && !notice && (
              <div className="rounded-lg bg-neutral-500/10 border border-neutral-300 dark:border-neutral-700 px-3 py-2 text-[11px] text-neutral-600 dark:text-neutral-300">
                {authHint}
              </div>
            )}
            {notice && (
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-[11px] text-emerald-700 dark:text-emerald-300">
                {notice}
              </div>
            )}
            {signInError && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-[11px] text-red-600 dark:text-red-400">
                {signInError}
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleMagicLink();
              }}
              className="space-y-2"
            >
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="name@company.com"
                className="w-full px-3 py-2 text-xs rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={busy}
                className="w-full py-2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-semibold text-xs rounded-xl hover:opacity-90 transition-opacity cursor-pointer shadow-xs disabled:opacity-50"
              >
                {busy ? 'Working…' : 'Send Magic Link'}
              </button>
            </form>
          </div>
        )}
        {activeTab === 'mudbase' && mudReady && (
          /* Tab 3: Mudbase email + password */
          <div className="p-5 space-y-3 text-xs">
            <div className="text-center space-y-1">
              <h3 className="font-bold text-base">Mudbase account</h3>
              <p className="text-xs text-neutral-500">
                {mudMode === 'register'
                  ? 'Create an account for this project. A verification email follows.'
                  : mudMode === 'reset'
                    ? 'Reset your password via email.'
                    : 'Sign in with your project account.'}
              </p>
            </div>
            <div className="flex rounded-lg bg-neutral-100 dark:bg-neutral-800 p-0.5 text-[11px] font-medium">
              {(['signin', 'register', 'reset'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMudMode(m);
                    setMudError(null);
                  }}
                  className={`flex-1 rounded-md px-2 py-1 transition-colors ${
                    mudMode === m ? 'bg-white dark:bg-neutral-700 shadow-xs text-neutral-900 dark:text-white' : 'text-neutral-500'
                  }`}
                >
                  {m === 'signin' ? 'Sign in' : m === 'register' ? 'Register' : 'Reset'}
                </button>
              ))}
            </div>
            {mudError && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-[11px] text-red-600 dark:text-red-400">
                {mudError}
              </div>
            )}
            {notice && (
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-[11px] text-emerald-700 dark:text-emerald-300">
                {notice}
              </div>
            )}
            <form onSubmit={handleMudSubmit} className="space-y-2">
              {mudMode === 'register' && (
                <input
                  value={mudName}
                  onChange={(e) => setMudName(e.target.value)}
                  placeholder="Display name (optional)"
                  autoComplete="name"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              )}
              <input
                type="email"
                value={mudEmail}
                onChange={(e) => setMudEmail(e.target.value)}
                placeholder="name@company.com"
                autoComplete="email"
                className="w-full px-3 py-2 text-xs rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {mudMode !== 'reset' && (
                <input
                  type="password"
                  value={mudPassword}
                  onChange={(e) => setMudPassword(e.target.value)}
                  placeholder={mudMode === 'register' ? 'Choose a password (8+ chars)' : 'Your password'}
                  autoComplete={mudMode === 'register' ? 'new-password' : 'current-password'}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              )}
              <button
                type="submit"
                disabled={busy}
                className="w-full py-2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-semibold text-xs rounded-xl hover:opacity-90 transition-opacity cursor-pointer shadow-xs disabled:opacity-50"
              >
                {busy ? 'Working…' : mudMode === 'register' ? 'Create account' : mudMode === 'reset' ? 'Send reset email' : 'Sign in'}
              </button>
            </form>
            {mudMode === 'signin' && (
              <>
                <button
                  type="button"
                  disabled={busy || !mudEmail.trim()}
                  title="Passwordless sign-in via email link"
                  onClick={() => {
                    const email = mudEmail.trim();
                    if (!email || busy) return;
                    setBusy(true);
                    setMudError(null);
                    void mudMagicLink(email)
                      .then((msg) => setNotice(msg))
                      .catch((err) => setMudError((err as Error).message))
                      .finally(() => setBusy(false));
                  }}
                  className="w-full text-center text-[11px] text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200 underline-offset-2 hover:underline disabled:opacity-40"
                >
                  Email me a sign-in link instead
                </button>
                {(oauthLoading || (oauthProviders ?? []).length > 0) && (
                  <>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-800" />
                      <span className="text-[10.5px] text-neutral-400">or continue with</span>
                      <div className="flex-1 h-px bg-neutral-200 dark:bg-neutral-800" />
                    </div>
                    <div className="flex gap-2">
                      {(oauthProviders ?? ['github', 'google'])
                        .filter((p) => p === 'github' || p === 'google')
                        .map((p) => (
                          <button
                            key={p}
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              try {
                                mudOAuthStart(p);
                              } catch (err) {
                                setMudError((err as Error).message);
                              }
                            }}
                            className="flex-1 py-2 rounded-xl border border-neutral-300 dark:border-neutral-700 font-semibold text-xs hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors disabled:opacity-40"
                          >
                            {p === 'github' ? 'GitHub' : 'Google'}
                          </button>
                        ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
