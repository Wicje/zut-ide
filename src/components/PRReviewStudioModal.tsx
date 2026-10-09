import React, { useState } from 'react';
import {
  X,
  GitPullRequest,
  GitMerge,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  FileCode,
  GitCommit,
  Check,
  ChevronDown,
  Clock,
  Sparkles,
} from 'lucide-react';
import { DiffFile } from '../types';

export interface PRCommit {
  hash: string;
  message: string;
  time: string;
}

export interface PRCheck {
  name: string;
  status: 'passed' | 'failed' | 'running';
  time: string;
}

export interface PRComment {
  author: string;
  time: string;
  body: string;
}

interface PRReviewStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: DiffFile[];
  onMergeSuccess?: () => void;
  theme?: 'light' | 'dark';
  title?: string;
  prNumber?: number;
  author?: string;
  baseBranch?: string;
  headBranch?: string;
  commits?: PRCommit[];
  checks?: PRCheck[];
  comments?: PRComment[];
  /** Real merge channel. Resolves when the merge lands. */
  onMerge?: () => Promise<void>;
}

export const PRReviewStudioModal: React.FC<PRReviewStudioModalProps> = ({
  isOpen,
  onClose,
  files,
  onMergeSuccess,
  theme = 'light',
  title,
  prNumber,
  author,
  baseBranch = 'main',
  headBranch,
  commits = [],
  checks = [],
  comments = [],
  onMerge,
}) => {
  const isDark = theme === 'dark';
  const [activeTab, setActiveTab] = useState<'conversation' | 'commits' | 'checks' | 'files'>('conversation');
  const [prStatus, setPrStatus] = useState<'open' | 'merged'>('open');
  const [reviewDecision, setReviewDecision] = useState<'approved' | null>(null);
  const [isReviewMenuOpen, setIsReviewMenuOpen] = useState(false);
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleMerge = () => {
    if (!onMerge) {
      setPrStatus('merged');
      if (onMergeSuccess) onMergeSuccess();
      return;
    }
    setMerging(true);
    setMergeError(null);
    void onMerge()
      .then(() => {
        setPrStatus('merged');
        if (onMergeSuccess) onMergeSuccess();
      })
      .catch((e: unknown) => {
        setMergeError((e as Error)?.message ?? 'Merge failed.');
      })
      .finally(() => setMerging(false));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-2xl rounded-2xl shadow-2xl border overflow-hidden flex flex-col max-h-[85vh] ${
          isDark
            ? 'bg-[#18181c] border-neutral-700 text-neutral-100'
            : 'bg-white border-neutral-200 text-neutral-800'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div
          className={`p-4 border-b space-y-2 ${
            isDark ? 'border-neutral-800 bg-[#1f1f25]' : 'border-neutral-200 bg-neutral-50/80'
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold flex items-center gap-1 ${
                  prStatus === 'merged'
                    ? 'bg-purple-600 text-white'
                    : 'bg-emerald-600 text-white'
                }`}>
                  {prStatus === 'merged' ? <GitMerge size={12} /> : <GitPullRequest size={12} />}
                  <span className="capitalize">{prStatus}</span>
                </span>
                <h3 className="font-bold text-sm">
                  {title ?? 'Review workspace changes'}{' '}
                  {prNumber != null && <span className="text-neutral-400">#{prNumber}</span>}
                </h3>
              </div>

              <div className="text-[11.5px] text-neutral-500 flex items-center gap-1.5 font-mono">
                <span className="font-sans font-medium text-neutral-800 dark:text-neutral-200">{author ?? 'you'}</span>
                <span>wants to merge {commits.length} commit{commits.length === 1 ? '' : 's'} into</span>
                <span className="bg-neutral-200/80 dark:bg-neutral-800 px-1.5 py-0.2 rounded text-[11px]">{baseBranch}</span>
                <span>from</span>
                <span className="bg-neutral-200/80 dark:bg-neutral-800 px-1.5 py-0.2 rounded text-[11px]">{headBranch ?? 'workspace'}</span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 p-1"
            >
              <X size={15} />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-4 pt-1 border-t border-neutral-200/60 dark:border-neutral-800 text-xs font-medium">
            <button
              onClick={() => setActiveTab('conversation')}
              className={`pb-1 flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'conversation'
                  ? 'border-b-2 border-blue-500 font-semibold text-neutral-900 dark:text-white'
                  : 'text-neutral-400 hover:text-neutral-700'
              }`}
            >
              <MessageSquare size={13} />
              <span>Conversation</span>
            </button>

            <button
              onClick={() => setActiveTab('commits')}
              className={`pb-1 flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'commits'
                  ? 'border-b-2 border-blue-500 font-semibold text-neutral-900 dark:text-white'
                  : 'text-neutral-400 hover:text-neutral-700'
              }`}
            >
              <GitCommit size={13} />
              <span>Commits ({commits.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('checks')}
              className={`pb-1 flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'checks'
                  ? 'border-b-2 border-blue-500 font-semibold text-neutral-900 dark:text-white'
                  : 'text-neutral-400 hover:text-neutral-700'
              }`}
            >
              <CheckCircle2 size={13} className="text-emerald-500" />
              <span>Checks ({checks.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('files')}
              className={`pb-1 flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'files'
                  ? 'border-b-2 border-blue-500 font-semibold text-neutral-900 dark:text-white'
                  : 'text-neutral-400 hover:text-neutral-700'
              }`}
            >
              <FileCode size={13} />
              <span>Files Changed ({files.length})</span>
            </button>
          </div>
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
          {activeTab === 'conversation' && (
            <div className="space-y-3">
              {comments.length === 0 && (
                <p className="text-xs text-neutral-500">No review comments yet.</p>
              )}
              {comments.map((c, i) => (
                <div key={i} className="p-3 rounded-xl border border-neutral-200 dark:border-neutral-700 space-y-2">
                  <div className="flex items-center justify-between text-neutral-500 text-[11px]">
                    <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                      {c.author}
                    </span>
                    <span>{c.time}</span>
                  </div>
                  <p className="text-xs leading-relaxed text-neutral-700 dark:text-neutral-300">
                    {c.body}
                  </p>
                </div>
              ))}

              {/* Automated Checks Summary Card */}
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-500" />
                  <span className="font-medium">
                    {checks.length === 0
                      ? 'No checks recorded yet'
                      : checks.every((c) => c.status === 'passed')
                        ? `All checks have passed (${checks.length} successful check${checks.length === 1 ? '' : 's'})`
                        : `${checks.filter((c) => c.status === 'passed').length}/${checks.length} checks passing`}
                  </span>
                </div>
                {checks.length > 0 && (
                  <span className="text-[11px] font-mono opacity-80">
                    {Math.round((checks.filter((c) => c.status === 'passed').length / checks.length) * 100)}% Passing
                  </span>
                )}
              </div>

              {/* Status Banner */}
              {prStatus === 'merged' && (
                <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-700 dark:text-purple-300 flex items-center gap-2">
                  <GitMerge size={16} />
                  <span>Pull request successfully merged into main branch.</span>
                </div>
              )}
            </div>
          )}

          {activeTab === 'commits' && (
            <div className="space-y-2">
              {commits.length === 0 && (
                <p className="text-xs text-neutral-500">No commits yet — checkpoints appear here as you work.</p>
              )}
              {commits.map((c) => (
                <div
                  key={c.hash}
                  className="flex items-center justify-between p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <GitCommit size={14} className="text-blue-500 shrink-0" />
                    <span className="font-medium truncate">{c.message}</span>
                  </div>
                  <div className="flex items-center gap-2 text-neutral-400 font-mono text-[11px] shrink-0 ml-2">
                    <span className="bg-neutral-100 dark:bg-neutral-800 px-1 rounded">{c.hash}</span>
                    <span>{c.time}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'checks' && (
            <div className="space-y-2">
              {checks.length === 0 && (
                <p className="text-xs text-neutral-500">No checks yet — run the project to record one.</p>
              )}
              {checks.map((chk, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-emerald-500" />
                    <span className="font-medium">{chk.name}</span>
                  </div>
                  <span className="font-mono text-[11px] text-neutral-400">{chk.time}</span>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'files' && (
            <div className="space-y-2">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 font-code text-[11.5px]"
                >
                  <span className="truncate">{file.path}</span>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <span className="text-emerald-600 font-medium">+{file.additions}</span>
                    <span className="text-red-600 font-medium">-{file.deletions}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div
          className={`p-3 border-t flex items-center justify-between ${
            isDark ? 'border-neutral-800 bg-[#161619]' : 'border-neutral-200 bg-neutral-50'
          }`}
        >
          {/* Review Decision Button */}
          <div className="relative">
            <button
              onClick={() => setIsReviewMenuOpen(!isReviewMenuOpen)}
              className="px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-xs font-medium flex items-center gap-1.5 hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
            >
              {reviewDecision === 'approved' ? (
                <span className="text-emerald-600 font-semibold flex items-center gap-1">
                  <Check size={13} />
                  <span>Approved</span>
                </span>
              ) : (
                <span>Review Changes</span>
              )}
              <ChevronDown size={11} className="text-neutral-400" />
            </button>

            {isReviewMenuOpen && (
              <div
                className={`absolute left-0 bottom-full mb-1 w-44 rounded-xl border shadow-xl p-1 z-30 text-xs ${
                  isDark ? 'bg-[#222228] border-neutral-700 text-neutral-200' : 'bg-white border-neutral-200 text-neutral-700'
                }`}
              >
                <button
                  onClick={() => {
                    setReviewDecision('approved');
                    setIsReviewMenuOpen(false);
                  }}
                  className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center gap-2 cursor-pointer"
                >
                  <Check size={12} className="text-emerald-500" />
                  <span>Approve</span>
                </button>
                <button
                  onClick={() => setIsReviewMenuOpen(false)}
                  className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center gap-2 cursor-pointer"
                >
                  <MessageSquare size={12} className="text-blue-500" />
                  <span>Comment</span>
                </button>
              </div>
            )}
          </div>

          {/* Merge Pull Request Button */}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-neutral-500 hover:text-neutral-700 text-xs font-medium"
            >
              Cancel
            </button>

            {mergeError && (
              <span className="text-[11px] text-red-600 dark:text-red-400">{mergeError}</span>
            )}
            {prStatus === 'open' ? (
              <button
                onClick={handleMerge}
                disabled={merging}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <GitMerge size={13} />
                <span>{merging ? 'Merging…' : 'Squash and Merge'}</span>
              </button>
            ) : (
              <button
                onClick={onClose}
                className="px-4 py-1.5 rounded-lg bg-purple-600 text-white font-semibold text-xs shadow-sm"
              >
                Merged into Main
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
