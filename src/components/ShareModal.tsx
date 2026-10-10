import React, { useState } from 'react';
import { X, Link2, Copy, Check, Unlink } from 'lucide-react';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  link: string | null;
  canShare: boolean;
  busy?: boolean;
  onCreate: () => void;
  onRevoke: () => void;
  theme?: 'light' | 'dark';
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  onClose,
  link,
  canShare,
  busy,
  onCreate,
  onRevoke,
  theme = 'light',
}) => {
  const isDark = theme === 'dark';
  const [copied, setCopied] = useState(false);
  if (!isOpen) return null;

  function copy() {
    if (!link) return;
    navigator.clipboard?.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 max-sm:p-2 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-md rounded-2xl shadow-2xl border overflow-hidden max-sm:w-full max-sm:max-w-full max-sm:max-h-[calc(100dvh-2rem)] ${
          isDark ? 'bg-[#18181c] border-neutral-700 text-neutral-100' : 'bg-white border-neutral-200 text-neutral-800'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`h-11 px-4 border-b flex items-center justify-between ${
            isDark ? 'border-neutral-800 bg-[#1f1f25]' : 'border-neutral-200 bg-neutral-50'
          }`}
        >
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Link2 size={15} className="text-red-500" />
            <span>Share read-only link</span>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600">
            <X size={15} />
          </button>
        </div>

        <div className="p-4 space-y-3 text-xs">
          <p className="text-neutral-500">
            Viewers open a sandboxed, read-only copy — they can't edit or see your account.
          </p>
          {link ? (
            <>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={link}
                  onFocus={(e) => e.currentTarget.select()}
                  className="h-9 flex-1 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-transparent px-2.5 font-mono text-[11px] focus:outline-none"
                />
                <button
                  onClick={copy}
                  className="h-9 px-3 rounded-lg border border-neutral-300 dark:border-neutral-700 font-medium flex items-center gap-1.5 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                >
                  {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <button
                onClick={onRevoke}
                disabled={busy}
                className="flex items-center gap-1.5 text-red-600 dark:text-red-400 text-[11px] font-medium hover:underline disabled:opacity-50"
              >
                <Unlink size={12} /> Stop sharing this link
              </button>
            </>
          ) : (
            <button
              onClick={onCreate}
              disabled={!canShare || busy}
              title={canShare ? 'Create a read-only link' : 'Sign in + cloud project required'}
              className="w-full py-2 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-semibold text-xs hover:opacity-90 disabled:opacity-40"
            >
              {busy ? 'Working…' : 'Create link'}
            </button>
          )}
          {!canShare && !link && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              Sign in with a cloud project to share. Local-only projects can't mint links.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
