import React, { useState } from 'react';
import mark from '../assets/zut-mark-white.png';

// Set a new password after a recovery link.
//
// The reset email lands here (/app) with a one-time recovery session in the
// URL. This card is the missing half of that flow: without it the link only
// signs you in and leaves the password unchanged.

interface SetPasswordCardProps {
  onSubmit: (password: string) => Promise<void>;
  onCancel: () => void;
  /** Shown when updateUser fails. */
  error?: string | null;
  onError?: (message: string | null) => void;
  theme?: 'light' | 'dark';
}

export const SetPasswordCard: React.FC<SetPasswordCardProps> = ({
  onSubmit,
  onCancel,
  error,
  onError,
  theme = 'dark',
}) => {
  const isDark = theme !== 'light';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    onError?.(null);
    if (password.length < 8) {
      onError?.('Passwords need at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      onError?.('The two passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await onSubmit(password);
    } catch (err) {
      onError?.(err instanceof Error ? err.message : 'Could not update the password.');
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
      <form
        onSubmit={submit}
        className={`w-full max-w-sm rounded-2xl border p-6 shadow-2xl ${
          isDark
            ? 'bg-[#161618] border-white/10 text-neutral-100'
            : 'bg-white border-black/10 text-neutral-900'
        }`}
      >
        <div className="flex items-center gap-2.5 mb-4">
          <img
            src={mark}
            alt=""
            className={`h-7 w-7 ${isDark ? '' : 'brightness-0'}`}
          />
          <div>
            <p className="font-bold leading-none">Set a new password</p>
            <p className={`text-xs mt-1 ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>
              You followed a reset link — choose the password you want from now on.
            </p>
          </div>
        </div>
        <label className="block text-[11px] font-medium mb-1.5 text-neutral-400" htmlFor="new-password">
          New password
        </label>
        <input
          id="new-password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="8+ characters"
          className={`w-full rounded-lg border px-3 py-2 text-[13px] outline-none transition-colors mb-3 ${
            isDark
              ? 'bg-neutral-900 border-white/10 focus:border-red-600 placeholder-neutral-600'
              : 'bg-[#fafafc] border-black/10 focus:border-red-600 placeholder-neutral-400'
          }`}
        />
        <label className="block text-[11px] font-medium mb-1.5 text-neutral-400" htmlFor="confirm-password">
          Confirm password
        </label>
        <input
          id="confirm-password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Repeat it"
          className={`w-full rounded-lg border px-3 py-2 text-[13px] outline-none transition-colors ${
            isDark
              ? 'bg-neutral-900 border-white/10 focus:border-red-600 placeholder-neutral-600'
              : 'bg-[#fafafc] border-black/10 focus:border-red-600 placeholder-neutral-400'
          }`}
        />
        {error && <p className="mt-2 text-[11px] text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="mt-4 w-full rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-60 text-white text-[13px] font-semibold py-2.5 transition-colors cursor-pointer"
        >
          {busy ? 'Updating…' : 'Update password'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={`block w-full text-center text-[11px] mt-3 underline underline-offset-2 ${
            isDark ? 'text-neutral-500 hover:text-neutral-300' : 'text-neutral-400 hover:text-neutral-700'
          }`}
        >
          Cancel — keep my current session
        </button>
      </form>
    </div>
  );
};
