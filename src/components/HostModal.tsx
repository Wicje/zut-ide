import React, { useEffect, useState } from 'react';
import { X, Server, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import {
  getHostConfig,
  hostHealth,
  isEnvHost,
  normalizeUrl,
  setHostConfig,
  type HostConfig,
  type HostHealth,
} from '../lib/host';

interface HostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (config: HostConfig | null) => void;
  theme?: 'light' | 'dark';
}

export const HostModal: React.FC<HostModalProps> = ({ isOpen, onClose, onSaved, theme = 'light' }) => {
  const isDark = theme === 'dark';
  const existing = getHostConfig();
  const [url, setUrl] = useState(existing?.url ?? 'http://localhost:8790');
  const [token, setToken] = useState(existing?.token ?? '');
  const [busy, setBusy] = useState(false);
  const [health, setHealth] = useState<HostHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const locked = isEnvHost();

  useEffect(() => {
    if (!isOpen) return;
    const current = getHostConfig();
    setUrl(current?.url ?? 'http://localhost:8790');
    setToken(current?.token ?? '');
    setHealth(null);
    setError(null);
  }, [isOpen]);

  if (!isOpen) return null;

  async function test() {
    setBusy(true);
    setError(null);
    setHealth(null);
    try {
      setHealth(await hostHealth({ url: normalizeUrl(url), token: token.trim() }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function save() {
    const config = { url: normalizeUrl(url), token: token.trim() };
    if (!config.url) return;
    setHostConfig(config);
    onSaved?.(config);
    onClose();
  }

  function disconnect() {
    setHostConfig(null);
    onSaved?.(null);
    onClose();
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
            <Server size={15} className="text-red-500" />
            <span>Connect a host</span>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600" aria-label="Close">
            <X size={15} />
          </button>
        </div>

        <div className="p-4 space-y-3 text-xs">
          <p className="text-neutral-500 leading-relaxed">
            A host gives this tab a real shell, git, and a workspace on a machine you control. On the
            same machine run <code className="font-mono text-[11px]">npm run host</code>.
          </p>

          {locked && (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-[11px]">
              Configured by the build via VITE_ZUT_HOST_URL / VITE_ZUT_HOST_TOKEN.
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-[11px] flex gap-1.5">
              <AlertCircle size={13} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {health && (
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-[11px] text-emerald-700 dark:text-emerald-400 space-y-0.5">
              <div className="flex items-center gap-1.5 font-semibold">
                <CheckCircle size={13} /> Host reachable
              </div>
              {health.workspace && (
                <div className="font-mono text-[10.5px] break-all">{health.workspace}</div>
              )}
              <div>
                {health.mode} · terminal {health.terminal ? 'on' : 'off'} · git {health.git ? 'on' : 'off'}
                {health.repo ? ' · repo' : ''}
              </div>
            </div>
          )}

          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-neutral-600 dark:text-neutral-300">Host URL</span>
            <input
              value={url}
              disabled={locked}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://localhost:8790"
              spellCheck={false}
              className="w-full h-8 rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-50"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-neutral-600 dark:text-neutral-300">
              Token <span className="font-normal text-neutral-400">(ZUT_HOST_TOKEN; blank on loopback)</span>
            </span>
            <input
              value={token}
              disabled={locked}
              onChange={(e) => setToken(e.target.value)}
              placeholder="shared host token"
              type="password"
              autoComplete="off"
              className="w-full h-8 rounded-md border border-neutral-300 dark:border-neutral-700 bg-transparent px-2 font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-50"
            />
          </label>

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => void test()}
              disabled={busy || !url.trim()}
              className="h-8 px-3 rounded-md border border-neutral-300 dark:border-neutral-700 text-[11px] font-medium hover:bg-neutral-50 dark:hover:bg-white/5 disabled:opacity-40 flex items-center gap-1.5"
            >
              {busy && <Loader2 size={12} className="animate-spin" />}
              Test
            </button>
            <div className="flex-1" />
            {existing && (
              <button onClick={disconnect} className="h-8 px-2.5 text-[11px] text-neutral-500 hover:text-red-500">
                Disconnect
              </button>
            )}
            <button
              onClick={save}
              disabled={!url.trim()}
              className="h-8 px-3.5 rounded-md bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-[11px] font-semibold hover:opacity-90 disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
