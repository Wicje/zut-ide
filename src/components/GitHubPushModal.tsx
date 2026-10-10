import React, { useState } from 'react';
import { X, GitBranch, ExternalLink } from 'lucide-react';

interface GitHubPushModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultRepo: string;
  onPush: (
    repo: string,
    isPrivate: boolean,
    token: string,
    opts: { branch: string; message: string },
  ) => Promise<{ url: string; prUrl?: string | null }>;
  /** Prefilled when a GitHub connector key is saved (account settings). */
  initialToken?: string;
  theme?: 'light' | 'dark';
}

export const GitHubPushModal: React.FC<GitHubPushModalProps> = ({
  isOpen,
  onClose,
  defaultRepo,
  onPush,
  initialToken,
  theme = 'light',
}) => {
  const isDark = theme === 'dark';
  const [repo, setRepo] = useState(defaultRepo);
  const [isPrivate, setIsPrivate] = useState(true);
  const [branch, setBranch] = useState('');
  const [message, setMessage] = useState('');
  const [token, setToken] = useState(initialToken ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [prUrl, setPrUrl] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setRepo(defaultRepo);
      setToken(initialToken ?? '');
      setError(null);
      setUrl(null);
      setPrUrl(null);
    }
  }, [isOpen, defaultRepo, initialToken]);

  if (!isOpen) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!repo.trim() || !token.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await onPush(repo.trim(), isPrivate, token.trim(), { branch, message });
      setUrl(r.url);
      setPrUrl(r.prUrl ?? null);
      if (!initialToken) setToken('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
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
            <GitBranch size={15} className="text-neutral-500" />
            <span>Push to GitHub</span>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600">
            <X size={15} />
          </button>
        </div>

        <div className="p-4 space-y-3 text-xs">
          <p className="text-neutral-500">
            Creates the repo if missing, pushes everything as <em>one</em> commit
            (branch + message are yours), and opens a pull request for feature
            branches. Uses a classic token with <code className="font-mono">repo</code> scope
            — it never leaves this request.
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
                className="flex items-center gap-1.5 font-mono text-[11px] text-red-600 dark:text-red-400 hover:underline"
              >
                {url} <ExternalLink size={11} />
              </a>
              {prUrl && (
                <a
                  href={prUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 font-mono text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline"
                >
                  {prUrl} <ExternalLink size={11} />
                </a>
              )}
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-2">
              <input
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                placeholder="my-project"
                aria-label="Repository name"
                className="w-full px-3 py-2 text-xs rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent focus:outline-none focus:ring-1 focus:ring-red-500"
              />
              <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
                <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} className="size-3.5 accent-emerald-600" />
                Private repository
              </label>
              <div className="flex items-center gap-2">
                <input
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="branch (empty = default)"
                  aria-label="Branch name"
                  spellCheck={false}
                  className="flex-1 min-w-0 px-3 py-2 text-xs rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent focus:outline-none focus:ring-1 focus:ring-red-500"
                />
                <input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="feat: what changed"
                  aria-label="Commit message"
                  spellCheck={false}
                  className="flex-[2] min-w-0 px-3 py-2 text-xs rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent focus:outline-none focus:ring-1 focus:ring-red-500"
                />
              </div>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="ghp_… (classic token, repo scope)"
                autoComplete="off"
                aria-label="GitHub token"
                className="w-full px-3 py-2 text-xs rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent font-mono focus:outline-none focus:ring-1 focus:ring-red-500"
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
