import React, { useState } from 'react';
import { joinWaitlist } from '../lib/waitlist';

interface WaitlistGateProps {
  onJoined: () => void;
  theme?: 'light' | 'dark';
}

// Closed-waitlist lock for /app. Rendered whenever hasJoinedWaitlist() is
// false (always, while IDE_OPEN is false). Joining records the flag for
// launch day but never unlocks — onJoined only fires once IDE_OPEN flips.
export function WaitlistGate({ onJoined, theme = 'dark' }: WaitlistGateProps) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const isDark = theme !== 'light';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await joinWaitlist(email);
      setDone(true);
      setMsg({
        text:
          r === 'exists'
            ? 'You are already on the list — we will email you at launch.'
            : 'You are on the list. Watch your inbox — we will email you at launch.',
        ok: true,
      });
      // NOTE: intentionally no onJoined() here while closed.
      void onJoined;
    } catch (err) {
      setMsg({ text: (err as Error).message, ok: false });
    } finally {
      setBusy(false);
    }
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
          <span className="w-8 h-8 rounded-lg bg-[#ff6b35] text-white font-extrabold flex items-center justify-center text-lg">
            Z
          </span>
          <div>
            <p className="font-bold leading-none">Zut is in private waitlist</p>
            <p className={`text-xs mt-1 ${isDark ? 'text-neutral-400' : 'text-neutral-500'}`}>
              Join the list — pilot members get in first, free.
            </p>
          </div>
        </div>
        <p className={`text-sm mb-4 ${isDark ? 'text-neutral-300' : 'text-neutral-600'}`}>
          The IDE is closed while we market the launch. Joining saves your
          spot — we email you when your access opens.
        </p>
        <form onSubmit={submit} className="flex flex-col gap-2.5">
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#ff6b35]/60 ${
              isDark
                ? 'bg-black/40 border-white/10 placeholder:text-neutral-500'
                : 'bg-neutral-50 border-black/10 placeholder:text-neutral-400'
            }`}
          />
          <button
            type="submit"
            disabled={busy || done}
            className="w-full rounded-xl bg-white text-black text-sm font-semibold py-2.5 hover:bg-neutral-200 transition-colors disabled:opacity-70 cursor-pointer"
          >
            {done ? 'You are on the list ✓' : busy ? 'Joining…' : 'Join the waitlist'}
          </button>
        </form>
        {msg && (
          <p
            aria-live="polite"
            className={`text-xs mt-3 ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}
          >
            {msg.text}
          </p>
        )}
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
