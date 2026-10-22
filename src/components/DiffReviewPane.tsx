import React, { useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  RotateCcw,
  Check,
  CheckSquare,
  Square,
} from 'lucide-react';
import { DiffFile, DiffViewMode } from '../types';
import { CodeLine } from './CodeLine';
import { SplitDiffViewer } from './SplitDiffViewer';
import { TerminalDrawer } from './TerminalDrawer';

interface DiffReviewPaneProps {
  files: DiffFile[];
  onAcceptFile: (fileId: string) => void;
  onRevertFile: (fileId: string) => void;
  onToggleStageFile: (fileId: string) => void;
  onAskComposer?: (codeSnippet: string) => void;
  diffViewMode: DiffViewMode;
  isTerminalOpen: boolean;
  onToggleTerminal: () => void;
  terminal?: {
    onCommand?: (cmd: string) => Promise<string[]>;
    initialLogs?: string[];
    telemetry?: import('./TerminalDrawer').RunTelemetry | null;
    onRefreshTelemetry?: () => void;
    eventLogs?: string[];
    completions?: string[];
    remoteLine?: string | null;
    host?: import('../lib/host').HostConfig | null;
    onConnectHost?: () => void;
    debug?: {
      host: import('../lib/host').HostConfig | null;
      files: string[];
      activeFilePath: string;
      breakpoints: import('../lib/debugClient').DebugBreakpoint[];
      onOpenFile?: (path: string) => void;
    };
  };
  theme?: 'light' | 'dark';
}

export const DiffReviewPane: React.FC<DiffReviewPaneProps> = ({
  files,
  onAcceptFile,
  onRevertFile,
  onToggleStageFile,
  onAskComposer,
  diffViewMode,
  isTerminalOpen,
  onToggleTerminal,
  terminal,
  theme = 'light',
}) => {
  const isDark = theme === 'dark';
  const [collapsedFiles, setCollapsedFiles] = useState<Record<string, boolean>>({});
  const [expandedContext, setExpandedContext] = useState<Record<string, boolean>>({});

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

  return (
    <div
      className={`@container flex-1 flex flex-col overflow-hidden select-none text-[13px] transition-colors ${
        isDark ? 'bg-[#1e1e24] text-neutral-200' : 'bg-white text-[#1e1e24]'
      }`}
    >
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
                    className="text-neutral-400 hover:text-red-500 transition-colors p-0.5"
                    title={file.staged ? 'Unstage file' : 'Stage file'}
                  >
                    {file.staged ? (
                      <CheckSquare size={13} className="text-red-500" />
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
        completions={terminal?.completions}
        remoteLine={terminal?.remoteLine}
        host={terminal?.host}
        onConnectHost={terminal?.onConnectHost}
        debug={terminal?.debug}
      />
    </div>
  );
};
