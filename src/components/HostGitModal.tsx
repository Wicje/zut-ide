import React, { useCallback, useEffect, useState } from 'react';
import {
  X,
  Server,
  GitBranch,
  GitCommit,
  RefreshCw,
  Plus,
  AlertCircle,
  Check,
  Loader2,
  FileDiff,
} from 'lucide-react';
import {
  hostGitBranches,
  hostGitCheckout,
  hostGitCommit,
  hostGitDiff,
  hostGitInit,
  hostGitLog,
  hostGitStatus,
  hostHealth,
  type HostConfig,
  type HostGitCommit,
  type HostGitStatus,
} from '../lib/host';

interface HostGitModalProps {
  isOpen: boolean;
  onClose: () => void;
  host: HostConfig | null;
  onConnectHost?: () => void;
  theme?: 'light' | 'dark';
}

function statusLabel(file: { index: string; worktree: string; untracked: boolean }): string {
  if (file.untracked) return 'U';
  return (file.index || file.worktree || '?').trim() || '?';
}

export const HostGitModal: React.FC<HostGitModalProps> = ({
  isOpen,
  onClose,
  host,
  onConnectHost,
  theme = 'light',
}) => {
  const isDark = theme === 'dark';
  const [isRepo, setIsRepo] = useState<boolean | null>(null);
  const [status, setStatus] = useState<HostGitStatus | null>(null);
  const [branches, setBranches] = useState<Array<{ name: string; current: boolean }>>([]);
  const [commits, setCommits] = useState<HostGitCommit[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [diff, setDiff] = useState<string>('');
  const [message, setMessage] = useState('');
  const [branchName, setBranchName] = useState('');
  const [targetBranch, setTargetBranch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!host) return;
    setError(null);
    try {
      const health = await hostHealth(host);
      setIsRepo(health.repo);
      if (!health.repo) {
        setStatus(null);
        setBranches([]);
        setCommits([]);
        return;
      }
      const next = await hostGitStatus(host);
      setStatus(next);
      setTargetBranch((prev) => prev || next.branch || '');
      const [b, l] = await Promise.all([hostGitBranches(host), hostGitLog(host, 12)]);
      setBranches(b);
      setCommits(l);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [host]);

  useEffect(() => {
    if (!isOpen) return;
    setMessage('');
    setBranchName('');
    setSelectedFile(null);
    setDiff('');
    setNotice(null);
    void refresh();
  }, [isOpen, refresh]);

  useEffect(() => {
    if (!isOpen || !host || !selectedFile) {
      setDiff('');
      return;
    }
    setBusy('diff');
    void hostGitDiff(host, selectedFile)
      .then(setDiff)
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(null));
  }, [isOpen, host, selectedFile]);

  if (!isOpen) return null;

  async function run(label: string, fn: () => Promise<void>): Promise<void> {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!host) {
    return (
      <Shell onClose={onClose} isDark={isDark} title="Host git">
        <div className="h-40 grid place-content-center text-center gap-2 text-xs text-neutral-500">
          <GitBranch size={18} className="mx-auto text-neutral-400" />
          <div>Connect a host to read and write its real git repository.</div>
          {onConnectHost && (
            <button
              onClick={() => {
                onClose();
                onConnectHost();
              }}
              className="mx-auto flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-white/5"
            >
              <Server size={12} /> Connect host
            </button>
          )}
        </div>
      </Shell>
    );
  }

  const changed = status?.files.length ?? 0;

  return (
    <Shell onClose={onClose} isDark={isDark} title="Host git">
      <div className="flex items-center gap-2 pb-3">
        <span className="flex items-center gap-1.5 text-[11px] font-mono text-neutral-500">
          <GitBranch size={12} className="text-red-500" />
          {status?.branch ?? (isRepo ? 'detached' : 'no repository')}
        </span>
        {status && (status.ahead > 0 || status.behind > 0) && (
          <span className="text-[10px] text-neutral-400">
            {status.ahead > 0 ? `↑${status.ahead}` : ''} {status.behind > 0 ? `↓${status.behind}` : ''}
          </span>
        )}
        <div className="flex-1" />
        <button
          onClick={() => void refresh()}
          disabled={busy !== null}
          className="flex items-center gap-1 px-2 py-1 rounded-md border border-neutral-300 dark:border-neutral-700 text-[10.5px] hover:bg-neutral-50 dark:hover:bg-white/5 disabled:opacity-40"
        >
          {busy === 'refresh' ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-[11px] flex gap-1.5">
          <AlertCircle size={13} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      {notice && (
        <div className="mb-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-[11px] text-emerald-700 dark:text-emerald-400 flex gap-1.5">
          <Check size={13} className="shrink-0 mt-0.5" />
          <span>{notice}</span>
        </div>
      )}

      {isRepo === false && (
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4 text-center space-y-2">
          <div className="text-xs font-medium">This workspace is not a git repository.</div>
          <p className="text-[11px] text-neutral-500">
            Initialize one on the host. Files stay where they are; nothing is committed yet.
          </p>
          <button
            onClick={() =>
              void run('init', async () => {
                await hostGitInit(host);
                setNotice('Initialized git with branch main.');
                await refresh();
              })
            }
            disabled={busy !== null}
            className="mx-auto flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-[11px] font-semibold disabled:opacity-40"
          >
            {busy === 'init' ? <Loader2 size={12} className="animate-spin" /> : <GitCommit size={12} />}
            Initialize repository
          </button>
        </div>
      )}

      {isRepo && (
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1.15fr] gap-3 min-h-0">
          <div className="space-y-3 min-h-0">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-neutral-400 pb-1">
                Changes {changed > 0 ? `· ${changed}` : ''}
              </div>
              <div className="max-h-32 overflow-y-auto rounded-md border border-neutral-200 dark:border-neutral-800">
                {changed === 0 && <div className="px-2 py-2 text-[11px] text-neutral-400">Working tree clean.</div>}
                {status?.files.map((file) => (
                  <button
                    key={file.path}
                    onClick={() => setSelectedFile(file.path)}
                    className={`w-full flex items-center gap-2 px-2 py-1 text-left text-[11px] border-b last:border-b-0 border-neutral-200/60 dark:border-neutral-800/60 ${
                      selectedFile === file.path
                        ? isDark
                          ? 'bg-red-500/15 text-red-300'
                          : 'bg-red-500/10 text-red-700'
                        : 'hover:bg-neutral-500/5'
                    }`}
                  >
                    <span className="w-4 shrink-0 font-mono text-[10px] text-amber-600 dark:text-amber-400">
                      {statusLabel(file)}
                    </span>
                    <span className="truncate font-mono" title={file.path}>
                      {file.path}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wide text-neutral-400">Commit all changes</div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="fix: describe what changed"
                rows={2}
                className={`w-full rounded-md border px-2 py-1.5 text-[11px] font-mono resize-none focus:outline-none focus:ring-1 focus:ring-red-500 ${
                  isDark ? 'bg-[#202025] border-neutral-700' : 'bg-white border-neutral-300'
                }`}
              />
              <button
                onClick={() =>
                  void run('commit', async () => {
                    const r = await hostGitCommit(host, message);
                    setMessage('');
                    setNotice(`Committed${r.sha ? ` ${r.sha}` : ''}${r.summary ? ` — ${r.summary}` : ''}.`);
                    await refresh();
                  })
                }
                disabled={busy !== null || !message.trim() || changed === 0}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-[11px] font-semibold disabled:opacity-40"
              >
                {busy === 'commit' ? <Loader2 size={12} className="animate-spin" /> : <GitCommit size={12} />}
                Stage all + commit
              </button>
            </div>

            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wide text-neutral-400">Branches</div>
              <div className="flex items-center gap-1.5">
                <select
                  value={targetBranch}
                  onChange={(e) => setTargetBranch(e.target.value)}
                  className={`h-7 min-w-0 flex-1 rounded-md border px-1.5 text-[10.5px] font-mono ${
                    isDark ? 'bg-[#202025] border-neutral-700' : 'bg-white border-neutral-300'
                  }`}
                >
                  {branches.map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.name}
                      {b.current ? ' (current)' : ''}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() =>
                    void run('checkout', async () => {
                      await hostGitCheckout(host, targetBranch, false);
                      setNotice(`Switched to ${targetBranch}.`);
                      await refresh();
                    })
                  }
                  disabled={busy !== null || !targetBranch || targetBranch === status?.branch}
                  className="h-7 px-2 rounded-md border border-neutral-300 dark:border-neutral-700 text-[10.5px] disabled:opacity-40"
                >
                  Switch
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  placeholder="feature/my-branch"
                  className={`h-7 min-w-0 flex-1 rounded-md border px-1.5 text-[10.5px] font-mono focus:outline-none focus:ring-1 focus:ring-red-500 ${
                    isDark ? 'bg-[#202025] border-neutral-700' : 'bg-white border-neutral-300'
                  }`}
                />
                <button
                  onClick={() =>
                    void run('branch', async () => {
                      await hostGitCheckout(host, branchName, true);
                      setNotice(`Created and switched to ${branchName}.`);
                      setBranchName('');
                      await refresh();
                    })
                  }
                  disabled={busy !== null || !branchName.trim()}
                  className="h-7 px-2 rounded-md border border-neutral-300 dark:border-neutral-700 text-[10.5px] flex items-center gap-1 disabled:opacity-40"
                >
                  <Plus size={11} /> New
                </button>
              </div>
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-wide text-neutral-400 pb-1">Recent commits</div>
              <div className="max-h-24 overflow-y-auto space-y-0.5">
                {commits.length === 0 && <div className="text-[10.5px] text-neutral-400">No commits yet.</div>}
                {commits.map((c) => (
                  <div key={c.sha} className="flex items-baseline gap-1.5 text-[10.5px]">
                    <span className="font-mono text-neutral-400 shrink-0">{c.shortSha}</span>
                    <span className="truncate" title={c.message}>
                      {c.message}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="min-h-0 flex flex-col rounded-md border border-neutral-200 dark:border-neutral-800 overflow-hidden">
            <div className="h-7 px-2 flex items-center gap-1.5 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-[#202025] text-[10.5px] text-neutral-500">
              <FileDiff size={11} />
              <span className="truncate font-mono">{selectedFile ?? 'Select a changed file'}</span>
            </div>
            <pre className="flex-1 min-h-[8rem] max-h-56 overflow-auto p-2 text-[10.5px] leading-4 font-mono whitespace-pre-wrap">
              {selectedFile ? (
                busy === 'diff' ? (
                  <span className="text-neutral-400">Loading diff…</span>
                ) : diff ? (
                  diff.split('\n').map((line, i) => (
                    <div
                      key={i}
                      className={
                        line.startsWith('+') && !line.startsWith('+++')
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : line.startsWith('-') && !line.startsWith('---')
                          ? 'text-red-600 dark:text-red-400'
                          : line.startsWith('@@')
                          ? 'text-sky-600 dark:text-sky-400'
                          : 'text-neutral-600 dark:text-neutral-300'
                      }
                    >
                      {line || ' '}
                    </div>
                  ))
                ) : (
                  <span className="text-neutral-400">No unstaged diff (already staged or binary).</span>
                )
              ) : (
                <span className="text-neutral-400">
                  Pick a file to see the real `git diff` from the host.
                </span>
              )}
            </pre>
          </div>
        </div>
      )}
    </Shell>
  );
};

function Shell({
  title,
  isDark,
  onClose,
  children,
}: {
  title: string;
  isDark: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 max-sm:p-2 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-2xl rounded-2xl shadow-2xl border overflow-hidden max-sm:max-h-[calc(100dvh-2rem)] max-sm:overflow-y-auto ${
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
            <GitBranch size={15} className="text-red-500" />
            <span>{title}</span>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600" aria-label="Close">
            <X size={15} />
          </button>
        </div>
        <div className="p-4 text-xs">{children}</div>
      </div>
    </div>
  );
}
