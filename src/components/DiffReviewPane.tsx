import React, { useState } from 'react';
import {
  GitBranch,
  Split,
  Sparkles,
  Plus,
  GitCommit,
  ChevronDown,
  ChevronRight,
  Copy,
  RotateCcw,
  Check,
  FileCode,
  Maximize2,
  Minimize2,
  Terminal,
  Activity,
  Layers,
  CheckSquare,
  Square,
} from 'lucide-react';
import { DiffFile, DiffViewMode, RightPaneMode } from '../types';
import { CodeLine } from './CodeLine';
import { SplitDiffViewer } from './SplitDiffViewer';
import { TerminalDrawer } from './TerminalDrawer';

interface DiffReviewPaneProps {
  files: DiffFile[];
  onAcceptFile: (fileId: string) => void;
  onRevertFile: (fileId: string) => void;
  onToggleStageFile: (fileId: string) => void;
  onCreatePR: () => void;
  onCommitPush: () => void;
  onOpenDeploy?: () => void;
  onAskComposer?: (codeSnippet: string) => void;
  onSwitchToEditor?: () => void;
  rightPaneMode?: RightPaneMode;
  onSelectPaneMode?: (mode: RightPaneMode) => void;
  diffViewMode: DiffViewMode;
  onToggleDiffViewMode: () => void;
  isTerminalOpen: boolean;
  onToggleTerminal: () => void;
  terminal?: {
    onCommand?: (cmd: string) => Promise<string[]>;
    initialLogs?: string[];
    telemetry?: import('./TerminalDrawer').RunTelemetry | null;
    onRefreshTelemetry?: () => void;
    eventLogs?: string[];
  };
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  theme?: 'light' | 'dark';
  branchName?: string;
}

export const DiffReviewPane: React.FC<DiffReviewPaneProps> = ({
  files,
  onAcceptFile,
  onRevertFile,
  onToggleStageFile,
  onCreatePR,
  onCommitPush,
  onOpenDeploy,
  onAskComposer,
  onSwitchToEditor,
  rightPaneMode = 'diff',
  onSelectPaneMode,
  diffViewMode,
  onToggleDiffViewMode,
  isTerminalOpen,
  onToggleTerminal,
  terminal,
  isMaximized,
  onToggleMaximize,
  theme = 'light',
  branchName,
}) => {
  const isDark = theme === 'dark';
  const [collapsedFiles, setCollapsedFiles] = useState<Record<string, boolean>>({});
  const [expandedContext, setExpandedContext] = useState<Record<string, boolean>>({});
  const [currentBranch, setCurrentBranch] = useState(branchName ?? 'workspace');
  const [isBranchDropdownOpen, setIsBranchDropdownOpen] = useState(false);
  const [copiedDiff, setCopiedDiff] = useState(false);

  function copyFullDiff() {
    const text = files
      .map((f) => {
        const body = [...(f.extraContextTop ?? []), ...f.lines]
          .map((l) => `${l.type === 'add' ? '+' : l.type === 'delete' ? '-' : ' '}${l.content}`)
          .join('\n');
        return `--- a/${f.path}\n+++ b/${f.path}\n${body}`;
      })
      .join('\n\n');
    if (!text) return;
    navigator.clipboard?.writeText(text);
    setCopiedDiff(true);
    setTimeout(() => setCopiedDiff(false), 2000);
  }

  React.useEffect(() => {
    if (branchName) setCurrentBranch(branchName);
  }, [branchName]);

  const toggleCollapse = (fileId: string) => {
    setCollapsedFiles((prev) => ({
      ...prev,
      [fileId]: !prev[fileId],
    }));
  };

  const toggleExpandContext = (fileId: string) => {
    setExpandedContext((prev) => ({
      ...prev,
      [fileId]: !prev[fileId],
    }));
  };

  const totalAdditions = files.reduce((acc, f) => acc + f.additions, 0);
  const totalDeletions = files.reduce((acc, f) => acc + f.deletions, 0);

  return (
    <div
      className={`flex-1 flex flex-col justify-between overflow-hidden select-none text-[13px] transition-colors ${
        isDark ? 'bg-[#1e1e24] text-neutral-200' : 'bg-white text-[#1e1e24]'
      }`}
    >
      {/* Top Header Bar */}
      <div
        className={`h-10 px-3.5 border-b flex items-center justify-between ${
          isDark ? 'border-neutral-800 bg-[#18181b]' : 'border-[#e5e5e7] bg-white'
        }`}
      >
        {/* Left cluster */}
        <div className="flex items-center gap-3">
          {/* Quick utility icons */}
          <div className="flex items-center gap-1.5 text-neutral-400">
            <button
              onClick={onToggleDiffViewMode}
              className={`p-1 rounded transition-colors cursor-pointer flex items-center gap-1 text-[11px] ${
                diffViewMode === 'split'
                  ? isDark
                    ? 'bg-blue-600/30 text-blue-400'
                    : 'bg-blue-50 text-blue-600'
                  : 'hover:text-neutral-700 dark:hover:text-neutral-200'
              }`}
              title={`Switch to ${diffViewMode === 'split' ? 'Unified' : 'Split'} view`}
            >
              <Split size={14} />
              <span className="font-sans font-medium capitalize hidden sm:inline">
                {diffViewMode}
              </span>
            </button>

            <button
              onClick={onToggleTerminal}
              className={`p-1 rounded transition-colors cursor-pointer flex items-center gap-1 text-[11px] ${
                isTerminalOpen
                  ? isDark
                    ? 'bg-emerald-600/30 text-emerald-400'
                    : 'bg-emerald-50 text-emerald-600'
                  : 'hover:text-neutral-700 dark:hover:text-neutral-200'
              }`}
              title="Toggle Terminal & Benchmarks drawer"
            >
              <Activity size={13} />
              <span className="font-sans font-medium hidden sm:inline">Telemetry</span>
            </button>

            {onSelectPaneMode && (
              <div className="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800 p-0.5 rounded-md border border-neutral-200 dark:border-neutral-700">
                <button
                  onClick={() => onSelectPaneMode('diff')}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                    rightPaneMode === 'diff'
                      ? isDark
                        ? 'bg-neutral-700 text-white'
                        : 'bg-white text-neutral-900 shadow-2xs'
                      : 'text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
                  }`}
                >
                  Diff
                </button>
                <button
                  onClick={() => onSelectPaneMode('editor')}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                    rightPaneMode === 'editor'
                      ? isDark
                        ? 'bg-neutral-700 text-white'
                        : 'bg-white text-neutral-900 shadow-2xs'
                      : 'text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
                  }`}
                >
                  Editor
                </button>
                <button
                  onClick={() => onSelectPaneMode('preview')}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                    rightPaneMode === 'preview'
                      ? isDark
                        ? 'bg-neutral-700 text-white'
                        : 'bg-white text-neutral-900 shadow-2xs'
                      : 'text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
                  }`}
                >
                  Preview
                </button>
                <button
                  onClick={() => onSelectPaneMode('tests')}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                    rightPaneMode === 'tests'
                      ? isDark
                        ? 'bg-neutral-700 text-white'
                        : 'bg-white text-neutral-900 shadow-2xs'
                      : 'text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
                  }`}
                >
                  Checks
                </button>
              </div>
            )}
          </div>

          <div className="h-3.5 w-px bg-neutral-200 dark:bg-neutral-800" />

          {/* SCM Branch selector */}
          <div className="flex items-center gap-2">
            <span className="text-neutral-400">
              <GitCommit size={14} />
            </span>
            <span
              className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${
                isDark ? 'bg-neutral-800 text-neutral-300' : 'bg-[#f0f0f3] text-neutral-600'
              }`}
            >
              Local
            </span>

            <div className="relative">
              <button
                onClick={() => setIsBranchDropdownOpen(!isBranchDropdownOpen)}
                className={`flex items-center gap-1 text-[12px] font-normal px-1 py-0.5 rounded transition-colors cursor-pointer ${
                  isDark
                    ? 'text-neutral-300 hover:text-white hover:bg-neutral-800'
                    : 'text-neutral-700 hover:text-neutral-900 hover:bg-neutral-100'
                }`}
              >
                <span>{currentBranch}</span>
                <ChevronDown size={12} className="text-neutral-400" />
              </button>

              {isBranchDropdownOpen && (
                <div
                  className={`absolute left-0 top-full mt-1 w-56 border rounded-lg shadow-xl py-1 z-30 text-[12px] ${
                    isDark ? 'bg-[#222228] border-neutral-700 text-neutral-200' : 'bg-white border-neutral-200 text-neutral-700'
                  }`}
                >
                  {[currentBranch, 'main'].filter((b, i, arr) => arr.indexOf(b) === i).map(
                    (b) => (
                      <button
                        key={b}
                        onClick={() => {
                          setCurrentBranch(b);
                          setIsBranchDropdownOpen(false);
                        }}
                        className={`w-full text-left px-3 py-1.5 flex items-center justify-between cursor-pointer ${
                          isDark ? 'hover:bg-neutral-800' : 'hover:bg-neutral-100'
                        } ${currentBranch === b ? 'font-medium text-blue-500' : ''}`}
                      >
                        <span>{b}</span>
                        {currentBranch === b && <Check size={12} />}
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={copyFullDiff}
            className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 p-1 transition-colors cursor-pointer"
            title={copiedDiff ? 'Diff copied!' : 'Copy full diff to clipboard'}
          >
            {copiedDiff ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
          </button>

          <button
            onClick={onCreatePR}
            className={`px-2.5 py-1 text-[12px] font-medium rounded-md shadow-2xs transition-all cursor-pointer ${
              isDark
                ? 'bg-[#27272f] hover:bg-[#32323c] text-white border border-neutral-700'
                : 'bg-white hover:bg-neutral-50 text-neutral-800 border border-[#d2d2d6]'
            }`}
          >
            Create PR
          </button>

          {onOpenDeploy && (
            <button
              onClick={onOpenDeploy}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-[12px] font-medium rounded-md shadow-2xs transition-all cursor-pointer ${
                isDark
                  ? 'bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700'
                  : 'bg-white hover:bg-neutral-50 text-neutral-800 border border-[#d2d2d6]'
              }`}
              title="Push to GitHub & Deploy to Vercel (⌘V)"
            >
              <svg viewBox="0 0 76 65" fill="currentColor" className="w-2.5 h-2.5">
                <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
              </svg>
              <span>Deploy</span>
            </button>
          )}

          <button
            onClick={onCommitPush}
            className={`flex items-center gap-1 px-2.5 py-1 text-[12px] font-medium rounded-md shadow-2xs transition-all cursor-pointer ${
              isDark
                ? 'bg-[#27272f] hover:bg-[#32323c] text-white border border-neutral-700'
                : 'bg-white hover:bg-neutral-50 text-neutral-800 border border-[#d2d2d6]'
            }`}
          >
            <span>Commit & Push</span>
            <ChevronDown size={12} className="text-neutral-500" />
          </button>

          {onToggleMaximize && (
            <button
              onClick={onToggleMaximize}
              className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 p-1 transition-colors ml-1 cursor-pointer"
              title={isMaximized ? 'Restore window size' : 'Expand window'}
            >
              <Maximize2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Secondary Bar: Files Summary */}
      <div
        className={`h-8 px-4 border-b flex items-center justify-between text-[12px] ${
          isDark ? 'border-neutral-800 bg-[#161618] text-neutral-300' : 'border-[#e5e5e7] bg-white text-neutral-700'
        }`}
      >
        <div className="flex items-center gap-2">
          <FileCode size={14} className="text-neutral-400" />
          <span className={`font-medium ${isDark ? 'text-white' : 'text-neutral-800'}`}>
            {files.length} Files Uncommitted
          </span>
          <span className="text-[#16a34a] font-medium">+{totalAdditions}</span>
          <span className="text-[#dc2626] font-medium">-{totalDeletions}</span>
        </div>

        <div className="text-[11px] text-neutral-400 hidden md:block">
          Click <span className="font-code text-blue-500">+</span> on line gutter to comment
        </div>
      </div>

      {/* Code Diffs Scroll Area */}
      <div className="flex-1 overflow-y-auto divide-y divide-[#e5e5e7] dark:divide-neutral-800">
        {files.map((file) => {
          const isCollapsed = collapsedFiles[file.id];
          const isContextExpanded = expandedContext[file.id];

          return (
            <div key={file.id} className={isDark ? 'bg-[#18181b]' : 'bg-white'}>
              {/* File Diff Header Accordion */}
              <div
                className={`h-8 px-3.5 border-b flex items-center justify-between cursor-pointer select-none transition-colors ${
                  isDark
                    ? 'border-neutral-800 hover:bg-neutral-800/40'
                    : 'border-[#e5e5e7]/80 hover:bg-neutral-50/70'
                }`}
                onClick={() => toggleCollapse(file.id)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {/* Stage File Checkbox */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleStageFile(file.id);
                    }}
                    className="text-neutral-400 hover:text-blue-500 transition-colors p-0.5"
                    title={file.staged ? 'Unstage file' : 'Stage file'}
                  >
                    {file.staged ? (
                      <CheckSquare size={13} className="text-blue-500" />
                    ) : (
                      <Square size={13} />
                    )}
                  </button>

                  <span className="text-neutral-400">
                    {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                  </span>
                  <span
                    className={`font-code text-[12px] font-medium truncate ${
                      isDark ? 'text-neutral-200' : 'text-neutral-700'
                    }`}
                  >
                    {file.path}
                  </span>
                  <div className="flex items-center gap-1.5 text-[11px] font-medium shrink-0 ml-1">
                    {file.additions > 0 && (
                      <span className="text-[#16a34a]">+{file.additions}</span>
                    )}
                    {file.deletions > 0 && (
                      <span className="text-[#dc2626]">-{file.deletions}</span>
                    )}
                  </div>
                </div>

                {/* Accept / Revert file hunk controls */}
                <div
                  className="flex items-center gap-1.5 text-neutral-400 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => onRevertFile(file.id)}
                    className="hover:text-neutral-700 dark:hover:text-neutral-200 p-1 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                    title="Revert file changes"
                  >
                    <RotateCcw size={13} />
                  </button>
                  <button
                    onClick={() => onAcceptFile(file.id)}
                    className={`p-1 rounded transition-colors cursor-pointer ${
                      file.accepted
                        ? 'text-green-600 bg-green-50 dark:bg-green-950/40'
                        : 'hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                    }`}
                    title={file.accepted ? 'Changes accepted' : 'Accept file changes'}
                  >
                    <Check size={14} />
                  </button>
                </div>
              </div>

              {/* Code lines container */}
              {!isCollapsed && (
                <div className="py-1">
                  {/* Context Expander Top */}
                  {file.extraContextTop && (
                    <button
                      onClick={() => toggleExpandContext(file.id)}
                      className={`w-full py-1 px-4 text-left text-[11px] font-code transition-colors flex items-center gap-1.5 ${
                        isDark
                          ? 'bg-neutral-900/40 hover:bg-neutral-800 text-neutral-400'
                          : 'bg-neutral-50 hover:bg-neutral-100 text-neutral-500'
                      }`}
                    >
                      <span>↕ {isContextExpanded ? 'Collapse context lines' : 'Expand 10 hidden context lines'}</span>
                    </button>
                  )}

                  {isContextExpanded && file.extraContextTop && (
                    <div className="opacity-75">
                      {file.extraContextTop.map((line, idx) => (
                        <CodeLine
                          key={`ctx-${idx}`}
                          line={line}
                          index={idx}
                          onAskComposer={onAskComposer}
                          theme={theme}
                        />
                      ))}
                    </div>
                  )}

                  {diffViewMode === 'split' ? (
                    <SplitDiffViewer file={file} theme={theme} />
                  ) : (
                    file.lines.map((line, idx) => (
                      <CodeLine
                        key={`${file.id}-line-${idx}`}
                        line={line}
                        index={idx}
                        onAskComposer={onAskComposer}
                        theme={theme}
                      />
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Embedded Terminal & Benchmark Drawer */}
      <TerminalDrawer
        isOpen={isTerminalOpen}
        onToggle={onToggleTerminal}
        theme={theme}
        onCommand={terminal?.onCommand}
        initialLogs={terminal?.initialLogs}
        telemetry={terminal?.telemetry}
        onRefreshTelemetry={terminal?.onRefreshTelemetry}
        eventLogs={terminal?.eventLogs}
      />
    </div>
  );
};
