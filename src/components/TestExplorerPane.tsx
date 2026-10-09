import React, { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Play,
  RotateCcw,
  Sparkles,
  ChevronDown,
  ChevronRight,
  FileCode,
  Clock,
  Zap,
} from 'lucide-react';
import { TestCase } from '../types';

interface TestExplorerPaneProps {
  onAutoFixTest: (test: TestCase) => void;
  theme?: 'light' | 'dark';
  /** Real check rows (run results). Empty = nothing has run yet. */
  tests?: TestCase[];
  running?: boolean;
  onRunAll?: () => void;
}

export const TestExplorerPane: React.FC<TestExplorerPaneProps> = ({
  onAutoFixTest,
  theme = 'light',
  tests,
  running,
  onRunAll,
}) => {
  const isDark = theme === 'dark';
  const [localRunning, setLocalRunning] = useState(false);
  const [expandedTestId, setExpandedTestId] = useState<string | null>(null);

  const testSuites = tests ?? [];
  const isRunning = running ?? localRunning;

  const handleRunAll = () => {
    if (!onRunAll) return;
    setLocalRunning(true);
    void Promise.resolve()
      .then(() => onRunAll())
      .catch(() => {})
      .finally(() => setLocalRunning(false));
  };

  const passedCount = testSuites.filter((t) => t.status === 'passed').length;
  const failedCount = testSuites.filter((t) => t.status === 'failed').length;

  return (
    <div
      className={`flex-1 flex flex-col justify-between overflow-hidden select-none text-[13px] transition-colors ${
        isDark ? 'bg-[#18181b] text-neutral-200' : 'bg-white text-neutral-800'
      }`}
    >
      {/* Header Bar */}
      <div
        className={`h-10 px-3.5 border-b flex items-center justify-between ${
          isDark ? 'border-neutral-800 bg-[#161619]' : 'border-[#e5e5e7] bg-white'
        }`}
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-xs">Run Checks</span>
          <span className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            {passedCount} Passed
          </span>
          {failedCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10.5px] font-semibold bg-red-500/10 text-red-600 dark:text-red-400">
              {failedCount} Failing
            </span>
          )}
        </div>

        <button
          onClick={handleRunAll}
          disabled={isRunning}
          className="flex items-center gap-1.5 px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded-md text-xs font-medium transition-colors shadow-xs cursor-pointer disabled:opacity-50"
        >
          <Play size={11} className={isRunning ? 'animate-spin' : ''} />
          <span>{isRunning ? 'Running checks...' : 'Run All'}</span>
        </button>
      </div>

      {/* Tests Tree */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 text-xs">
        {testSuites.length === 0 && !isRunning && (
          <div className="rounded-xl border border-dashed border-neutral-300 dark:border-neutral-700 px-4 py-6 text-center text-neutral-500">
            No checks yet — press Run All to execute the project entry.
          </div>
        )}
        {testSuites.map((test) => {
          const isFailed = test.status === 'failed';
          const isExpanded = expandedTestId === test.id;

          return (
            <div
              key={test.id}
              className={`rounded-xl border transition-colors ${
                isFailed
                  ? isDark
                    ? 'border-red-500/30 bg-red-500/5'
                    : 'border-red-200 bg-red-50/40'
                  : isDark
                  ? 'border-neutral-800 bg-[#202025]'
                  : 'border-neutral-200 bg-neutral-50/50'
              }`}
            >
              {/* Test Row */}
              <div
                onClick={() => setExpandedTestId(isExpanded ? null : test.id)}
                className="p-2.5 flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {isFailed ? (
                    <XCircle size={15} className="text-red-500 shrink-0" />
                  ) : (
                    <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
                  )}
                  <div className="truncate font-medium">{test.name}</div>
                </div>

                <div className="flex items-center gap-2 font-mono text-[11px] text-neutral-400 shrink-0 ml-2">
                  <span>{test.durationMs}ms</span>
                  {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </div>
              </div>

              {/* Failing Test Assertion Detail & Auto-Fix */}
              {isExpanded && isFailed && (
                <div className="px-3 pb-3 pt-1 space-y-2.5 border-t border-red-200 dark:border-red-900/30">
                  <div className="font-mono text-[11px] text-red-600 dark:text-red-400">
                    {test.error}
                  </div>

                  {/* Assertion Diff (only for real framework assertions) */}
                  {(test.expected !== undefined || test.actual !== undefined) && (
                    <div
                      className={`p-2 rounded font-code text-[11.5px] space-y-1 ${
                        isDark ? 'bg-black/50 text-neutral-300' : 'bg-white border border-neutral-200 text-neutral-700'
                      }`}
                    >
                      <div className="text-emerald-600 dark:text-emerald-400">
                        - Expected: {test.expected}
                      </div>
                      <div className="text-red-600 dark:text-red-400">
                        + Received: {test.actual}
                      </div>
                    </div>
                  )}

                  {/* Auto-Fix Action */}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[11px] text-neutral-400">
                      Target file: {test.file}
                    </span>

                    <button
                      onClick={() => onAutoFixTest(test)}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                    >
                      <Sparkles size={13} />
                      <span>⚡ Ask Agent to Fix Test</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
