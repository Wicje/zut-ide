import React, { useState } from 'react';
import { X, History, RotateCcw } from 'lucide-react';
import type { Snapshot } from '../adapters/zut';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  snapshots: Snapshot[];
  onRestore: (id: string) => void;
  theme?: 'light' | 'dark';
  /** P2: when set, offers a per-file filter for this path. */
  activeFile?: string | null;
}

function ago(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({
  isOpen,
  onClose,
  snapshots,
  onRestore,
  theme = 'light',
  activeFile = null,
}) => {
  const isDark = theme === 'dark';
  const [onlyFile, setOnlyFile] = useState(false);
  if (!isOpen) return null;

  // A snapshot "touches" the file when its content differs from the
  // previous snapshot in list order (first entry always counts).
  const touched = (idx: number): boolean => {
    if (!activeFile) return true;
    const cur = snapshots[idx]?.files?.[activeFile] ?? null;
    if (idx === 0) return cur !== null;
    const prev = snapshots[idx - 1]?.files?.[activeFile] ?? null;
    return cur !== prev;
  };
  const visible = snapshots.filter((_, i) => !onlyFile || !activeFile || touched(i));

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
            <History size={15} className="text-red-500" />
            <span>Version history</span>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600">
            <X size={15} />
          </button>
        </div>

        <div className="p-3 space-y-1.5 max-h-[50vh] overflow-y-auto text-xs">
          {activeFile && (
            <button
              onClick={() => setOnlyFile((v) => !v)}
              className={`w-full text-left px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer ${
                onlyFile
                  ? 'border-red-500/50 bg-red-500/10 text-red-600 dark:text-red-400'
                  : 'border-neutral-200 dark:border-neutral-700 text-neutral-500'
              }`}
            >
              {onlyFile ? `● Showing versions touching ${activeFile}` : `○ Show only versions touching ${activeFile}`}
            </button>
          )}
          {visible.length === 0 && (
            <p className="px-2 py-4 text-center text-neutral-500">
              No snapshots touch this file yet.
            </p>
          )}
          {snapshots.length === 0 && (
            <p className="px-2 py-4 text-center text-neutral-500">
              No snapshots yet — they land automatically before agent turns and restores.
            </p>
          )}
          {visible.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-2 rounded-lg border border-neutral-200 dark:border-neutral-700 px-2.5 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[11px] truncate">{s.id}</div>
                <div className="text-[11px] text-neutral-500">
                  {ago(s.createdAt)} · {Object.keys(s.files).length} files
                </div>
              </div>
              <button
                onClick={() => onRestore(s.id)}
                className="flex shrink-0 items-center gap-1 rounded-md border border-neutral-300 dark:border-neutral-700 px-2 py-1 text-[11px] font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800"
                title="Restore this snapshot (current state is checkpointed first)"
              >
                <RotateCcw size={11} /> Restore
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
