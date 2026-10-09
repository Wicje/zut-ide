import React, { useState } from 'react';
import {
  Terminal,
  Activity,
  FileText,
  ChevronDown,
  ChevronUp,
  Play,
  CheckCircle,
  Clock,
  Zap,
  TrendingDown,
  Cpu,
} from 'lucide-react';


export interface RunTelemetry {
  runs: number;
  medianMs: number | null;
  lastExit: number | null;
  lastAt: string | null;
}

interface TerminalDrawerProps {
  isOpen: boolean;
  onToggle: () => void;
  theme?: 'light' | 'dark';
  /** Real command channel: resolves with output lines to print. */
  onCommand?: (cmd: string) => Promise<string[]>;
  initialLogs?: string[];
  /** Real run telemetry (median/last from broker runs). Null = no runs yet. */
  telemetry?: RunTelemetry | null;
  onRefreshTelemetry?: () => void;
  /** Real event log lines. */
  eventLogs?: string[];
}

export const TerminalDrawer: React.FC<TerminalDrawerProps> = ({
  isOpen,
  onToggle,
  theme = 'light',
  onCommand,
  initialLogs,
  telemetry,
  onRefreshTelemetry,
  eventLogs,
}) => {
  const isDark = theme === 'dark';
  const [activeTab, setActiveTab] = useState<'benchmarks' | 'terminal' | 'logs'>('benchmarks');
  const [isBenchmarking, setIsBenchmarking] = useState(false);
  const [terminalLogs, setTerminalLogs] = useState<string[]>(
    () => initialLogs ?? ['Connected. Type `run [entry]`, `status`, `clear`, or `help`.'],
  );
  const [termInput, setTermInput] = useState('');
  const [busy, setBusy] = useState(false);

  const runBenchmark = () => {
    if (!onRefreshTelemetry) return;
    setIsBenchmarking(true);
    void Promise.resolve()
      .then(() => onRefreshTelemetry())
      .catch(() => {})
      .finally(() => setIsBenchmarking(false));
  };

  const handleCommand = (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = termInput.trim();
    if (!cmd || busy) return;
    setTermInput('');
    setTerminalLogs((prev) => [...prev.slice(-200), `❯ ${cmd}`]);
    if (!onCommand) {
      setTerminalLogs((prev) => [...prev.slice(-200), 'Terminal is not connected to a runner.']);
      return;
    }
    setBusy(true);
    void onCommand(cmd)
      .then((lines) => {
        setTerminalLogs((prev) => [...prev.slice(-200), ...lines.slice(0, 60)]);
      })
      .catch((err: unknown) => {
        setTerminalLogs((prev) => [
          ...prev.slice(-200),
          `error: ${(err as Error)?.message ?? 'command failed'}`,
        ]);
      })
      .finally(() => setBusy(false));
  };

  return (
    <div
      className={`border-t transition-all duration-200 select-none ${
        isOpen ? 'h-48' : 'h-7'
      } flex flex-col ${
        isDark ? 'bg-[#18181b] border-neutral-800 text-neutral-300' : 'bg-[#fbfbfd] border-[#e5e5e7] text-neutral-700'
      }`}
    >
      {/* Drawer Header Tabs */}
      <div
        className={`h-7 px-3 flex items-center justify-between border-b text-[11px] font-medium ${
          isDark ? 'border-neutral-800 bg-[#141416]' : 'border-[#e5e5e7] bg-[#f4f4f6]'
        }`}
      >
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              setActiveTab('benchmarks');
              if (!isOpen) onToggle();
            }}
            className={`flex items-center gap-1.5 pb-0.5 transition-colors cursor-pointer ${
              activeTab === 'benchmarks' && isOpen
                ? isDark
                  ? 'text-white border-b-2 border-blue-500 font-semibold'
                  : 'text-neutral-900 border-b-2 border-blue-600 font-semibold'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            <Activity size={12} className="text-emerald-500" />
            <span>Benchmarks & Latency</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('terminal');
              if (!isOpen) onToggle();
            }}
            className={`flex items-center gap-1.5 pb-0.5 transition-colors cursor-pointer ${
              activeTab === 'terminal' && isOpen
                ? isDark
                  ? 'text-white border-b-2 border-blue-500 font-semibold'
                  : 'text-neutral-900 border-b-2 border-blue-600 font-semibold'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            <Terminal size={12} className="text-blue-500" />
            <span>Terminal (zsh)</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('logs');
              if (!isOpen) onToggle();
            }}
            className={`flex items-center gap-1.5 pb-0.5 transition-colors cursor-pointer ${
              activeTab === 'logs' && isOpen
                ? isDark
                  ? 'text-white border-b-2 border-blue-500 font-semibold'
                  : 'text-neutral-900 border-b-2 border-blue-600 font-semibold'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            <FileText size={12} className="text-purple-500" />
            <span>Telemetry</span>
          </button>
        </div>

        {/* Toggle Collapse */}
        <button
          onClick={onToggle}
          className="text-neutral-400 hover:text-neutral-700 p-0.5 rounded cursor-pointer"
          title={isOpen ? 'Collapse drawer' : 'Expand drawer'}
        >
          {isOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>

      {/* Drawer Content */}
      {isOpen && (
        <div className="flex-1 overflow-y-auto p-3 text-xs">
          {activeTab === 'benchmarks' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-neutral-800 dark:text-neutral-100">
                    Run Telemetry
                  </span>
                  <span className="text-[10px] px-1.5 py-0.2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-full font-medium">
                    {telemetry && telemetry.runs > 0 ? `${telemetry.runs} runs` : 'No runs yet'}
                  </span>
                </div>
                {onRefreshTelemetry && (
                <button
                  onClick={runBenchmark}
                  disabled={isBenchmarking}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-xs transition-colors text-[11px]"
                >
                  <Play size={11} className={isBenchmarking ? 'animate-spin' : ''} />
                  <span>{isBenchmarking ? 'Refreshing...' : 'Refresh'}</span>
                </button>
                )}
              </div>

              {/* Metric Cards Grid */}
              <div className="grid grid-cols-4 gap-2.5">
                <div className={`p-2.5 rounded-lg border ${
                  isDark ? 'bg-[#202025] border-neutral-700' : 'bg-white border-neutral-200'
                }`}>
                  <div className="flex items-center justify-between text-neutral-400 text-[10.5px]">
                    <span>Median Run</span>
                    <TrendingDown size={12} className="text-emerald-500" />
                  </div>
                  <div className="text-base font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                    {telemetry?.medianMs != null ? `${telemetry.medianMs}ms` : '—'}
                  </div>
                  <div className="text-[10px] text-neutral-400">
                    Across broker runs
                  </div>
                </div>

                <div className={`p-2.5 rounded-lg border ${
                  isDark ? 'bg-[#202025] border-neutral-700' : 'bg-white border-neutral-200'
                }`}>
                  <div className="flex items-center justify-between text-neutral-400 text-[10.5px]">
                    <span>Total Runs</span>
                    <Zap size={12} className="text-amber-500" />
                  </div>
                  <div className="text-base font-bold text-neutral-800 dark:text-white mt-1">
                    {telemetry?.runs ?? 0}
                  </div>
                  <div className="text-[10px] text-neutral-400">
                    This workspace
                  </div>
                </div>

                <div className={`p-2.5 rounded-lg border ${
                  isDark ? 'bg-[#202025] border-neutral-700' : 'bg-white border-neutral-200'
                }`}>
                  <div className="flex items-center justify-between text-neutral-400 text-[10.5px]">
                    <span>Last Exit</span>
                    <Clock size={12} className="text-blue-500" />
                  </div>
                  <div className="text-base font-bold text-neutral-800 dark:text-white mt-1">
                    {telemetry?.lastExit ?? '—'}
                  </div>
                  <div className="text-[10px] text-neutral-400">
                    0 means success
                  </div>
                </div>

                <div className={`p-2.5 rounded-lg border ${
                  isDark ? 'bg-[#202025] border-neutral-700' : 'bg-white border-neutral-200'
                }`}>
                  <div className="flex items-center justify-between text-neutral-400 text-[10.5px]">
                    <span>Last Run</span>
                    <Cpu size={12} className="text-purple-500" />
                  </div>
                  <div className="text-base font-bold text-neutral-800 dark:text-white mt-1">
                    {telemetry?.lastAt ?? '—'}
                  </div>
                  <div className="text-[10px] text-neutral-400">
                    Local time
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'terminal' && (
            <div className="h-full flex flex-col justify-between font-code text-[11.5px]">
              <div className="space-y-0.5 overflow-y-auto max-h-28">
                {terminalLogs.map((log, i) => (
                  <div
                    key={i}
                    className={
                      log.startsWith('✓')
                        ? 'text-emerald-500'
                        : log.startsWith('❯')
                        ? 'text-neutral-400 font-semibold'
                        : 'text-neutral-600 dark:text-neutral-400'
                    }
                  >
                    {log}
                  </div>
                ))}
              </div>

              <form onSubmit={handleCommand} className="flex items-center gap-1.5 pt-1.5 border-t border-neutral-200/50 dark:border-neutral-800">
                <span className="text-emerald-500 font-bold">❯</span>
                <input
                  type="text"
                  value={termInput}
                  onChange={(e) => setTermInput(e.target.value)}
                  placeholder="run [entry], status, clear, help…"
                  className="flex-1 bg-transparent focus:outline-none text-neutral-800 dark:text-neutral-100 placeholder-neutral-400"
                />
              </form>
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="space-y-1 font-code text-[11px] text-neutral-600 dark:text-neutral-400">
              {(!eventLogs || eventLogs.length === 0) && (
                <div className="text-neutral-400">No events yet — runs, saves, and agent turns appear here.</div>
              )}
              {(eventLogs ?? []).map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
