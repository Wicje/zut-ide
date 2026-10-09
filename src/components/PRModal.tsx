import React, { useState } from 'react';
import { X, GitPullRequest, Check } from 'lucide-react';

interface PRModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (title: string, description: string) => void;
  baseBranch?: string;
  headBranch?: string;
  diffStat?: string;
  initialTitle?: string;
  initialDescription?: string;
}

export const PRModal: React.FC<PRModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  baseBranch = 'main',
  headBranch,
  diffStat,
  initialTitle = '',
  initialDescription = '',
}) => {
  const [prTitle, setPrTitle] = useState(initialTitle);
  const [prDesc, setPrDesc] = useState(initialDescription);

  React.useEffect(() => {
    if (isOpen) {
      setPrTitle(initialTitle);
      setPrDesc(initialDescription);
    }
  }, [isOpen, initialTitle, initialDescription]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white rounded-xl shadow-2xl border border-neutral-200 overflow-hidden text-neutral-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-11 px-4 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between text-[13px] font-medium">
          <div className="flex items-center gap-2 text-neutral-800">
            <GitPullRequest size={16} className="text-emerald-600" />
            <span>Create Pull Request</span>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-700 p-1 rounded transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        <div className="p-4 space-y-3.5 text-xs">
          <div className="flex items-center gap-2 p-2 bg-neutral-100 rounded-lg text-neutral-600 font-mono text-[11px]">
            <span className="font-semibold text-neutral-800">base:</span> {baseBranch}
            <span className="text-neutral-400">←</span>
            <span className="font-semibold text-neutral-800">compare:</span> {headBranch ?? 'workspace'}
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-neutral-700 uppercase tracking-wider mb-1">
              Title
            </label>
            <input
              type="text"
              value={prTitle}
              onChange={(e) => setPrTitle(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-neutral-700 uppercase tracking-wider mb-1">
              Description
            </label>
            <textarea
              rows={3}
              value={prDesc}
              onChange={(e) => setPrDesc(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 resize-none"
            />
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-neutral-200">
            <div className="text-[11px] text-neutral-500">
              {diffStat ?? 'No changes'}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-lg border border-neutral-300 text-neutral-700 hover:bg-neutral-50 font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => onSubmit(prTitle, prDesc)}
                className="px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-black text-white font-medium shadow-sm transition-colors flex items-center gap-1.5"
              >
                <Check size={14} />
                <span>Create Pull Request</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
