import React from 'react';
import mark from '../assets/zut-mark.png';
import { ShieldCheck } from 'lucide-react';

// The door to the IDE: you need an account.
//
// Accounts are what make the rest work — your projects, your agent's home
// (your machine or ours), your key. So the gate is a real gate: one card,
// one action, no marketing.

interface AccountGateProps {
  /** True while we are still looking for a session — show nothing yet. */
  checking: boolean;
  onCreateAccount: () => void;
  theme?: 'light' | 'dark';
}

export function AccountGate({ checking, onCreateAccount, theme = 'dark' }: AccountGateProps) {
  const isDark = theme !== 'light';

  if (checking) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md" />
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
      <div
        className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl ${
          isDark
            ? 'bg-[#161618] border-white/10 text-neutral-100'
            : 'bg-white border-black/10 text-neutral-900'
        }`}
      >
        <div className="flex items-center gap-2.5 mb-3">
          <img src={mark} alt="Zut" className={`h-7 w-7 ${isDark ? 'brightness-0 invert' : ''}`} />
          <div>
            <p className="font-bold leading-none">Create your Zut account</p>
            <p className={`text-xs mt-1 ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>
              One account. Your projects, your agent, your keys.
            </p>
          </div>
        </div>
        <p className={`text-sm mb-4 ${isDark ? 'text-neutral-300' : 'text-neutral-600'}`}>
          Sign in and the IDE opens: pick where the agent runs (your own machine
          or ours), then build.
        </p>
        <button
          type="button"
          onClick={onCreateAccount}
          className="w-full rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold py-2.5 transition-colors cursor-pointer"
        >
          Create account
        </button>
        <div
          className={`mt-4 flex items-start gap-2 text-xs ${
            isDark ? 'text-neutral-500' : 'text-neutral-500'
          }`}
        >
          <ShieldCheck size={13} className="mt-0.5 shrink-0" />
          <span>
            Your API keys stay in your browser. An account only ties your projects and your
            settings together — we never proxy your model calls.
          </span>
        </div>
        <a
          href="/"
          className={`block text-center text-xs mt-4 underline underline-offset-4 ${
            isDark ? 'text-neutral-400 hover:text-white' : 'text-neutral-500 hover:text-black'
          }`}
        >
          ← Back to landing
        </a>
      </div>
    </div>
  );
}
