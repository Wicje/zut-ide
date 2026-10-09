import React, { useState } from 'react';
import { X, GitBranch, ExternalLink } from 'lucide-react';

interface GitHubPushModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultRepo: string;
  onPush: (repo: string, isPrivate: boolean, token: string) => Promise<{ url: string }>;
  theme?: 'light' | 'dark';
}

export const GitHubPushModal: React.FC<GitHubPushModalProps> = ({
  isOpen,
  onClose,
  defaultRepo,
  onPush,
  theme = 'light',
}) => {
  const isDark = theme === 'dark';
  const [repo, setRepo] = useState(defaultRepo);
  const [isPrivate, setIsPrivate] = useState(true);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setRepo(defaultRepo);
      setError(null);
      setUrl(null);
    }
  }, [isOpen, defaultRepo]);

  if (!isOpen) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!repo.trim() || !token.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await onPush(repo.trim(), isPrivate, token.trim());
      setUrl(r.url);
      setToken('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-md rounded-2xl shadow-2xl border overflow-hidden ${
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
            <GitBranch size={15} className="text-neutral-500" />
            <span>Push to GitHub</span>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600">
            <X size={15} />
          </button>
        </div>

        <div className="p-4 space-y-3 text-xs">
          <p className="text-neutral-500">
            Creates the repository under your account and pushes every project file. Uses a classic
            token with <code className="font-mono">repo</code> scope — it never leaves this request.
          </p>
          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-[11px] text-red-600 dark:text-red-400">
              {error}
            </div>
          )}
          {url ? (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-2">
              <p className="text-emerald-700 dark:text-emerald-300 font-medium">Pushed successfully.</p>
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 font-mono text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
              >
                {url} <ExternalLink size={11} />
              </a>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-2">
              <input
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                placeholder="my-project"
                aria-label="Repository name"
                className="w-full px-3 py-2 text-xs rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
                <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} className="size-3.5 accent-emerald-600" />
                Private repository
              </label>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="ghp_… (classic token, repo scope)"
                autoComplete="off"
                aria-label="GitHub token"
                className="w-full px-3 py-2 text-xs rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={busy || !repo.trim() || !token.trim()}
                className="w-full py-2 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-semibold text-xs hover:opacity-90 disabled:opacity-40"
              >
                {busy ? 'Pushing…' : 'Push to GitHub'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
