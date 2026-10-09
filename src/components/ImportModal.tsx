import React, { useState } from 'react';
import { X, Globe } from 'lucide-react';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (url: string) => Promise<{ name: string; files: number }>;
  theme?: 'light' | 'dark';
}

export const ImportModal: React.FC<ImportModalProps> = ({ isOpen, onClose, onImport, theme = 'light' }) => {
  const isDark = theme === 'dark';
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setUrl('');
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await onImport(url.trim());
      onClose();
      void r;
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
            <Globe size={15} className="text-blue-500" />
            <span>Import from URL</span>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600">
            <X size={15} />
          </button>
        </div>

        <div className="p-4 space-y-3 text-xs">
          <p className="text-neutral-500">
            HTML page, CodePen pen, raw GitHub file, or JSON. Current work is checkpointed first;
            imported files merge in.
          </p>
          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-[11px] text-red-600 dark:text-red-400">
              {error}
            </div>
          )}
          <form onSubmit={submit} className="space-y-2">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
              inputMode="url"
              autoFocus
              className="w-full px-3 py-2 text-xs rounded-xl border border-neutral-300 dark:border-neutral-700 bg-transparent font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="submit"
              disabled={busy || !url.trim()}
              className="w-full py-2 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-semibold text-xs hover:opacity-90 disabled:opacity-40"
            >
              {busy ? 'Importing…' : 'Import'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
