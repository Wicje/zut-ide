import React, { useEffect, useRef, useState } from 'react';
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
  Server,
  RotateCw,
  Eraser,
  Bug,
} from 'lucide-react';
import { wsUrl, type HostConfig } from '../lib/host';
import type { DebugBreakpoint } from '../lib/debugClient';

// Debug UI + client are only needed when the tab is opened.
const DebugPanel = React.lazy(() =>
  import('./DebugPanel').then((m) => ({ default: m.DebugPanel })),
);
import type { Terminal as XTerm } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';


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
  /** Tab-completion candidates (commands + workspace paths). */
  completions?: string[];
  /** Honest remote-shell status line (null = hide). */
  remoteLine?: string | null;
  /** A configured `zut host`; enables the real shell (xterm + pty). */
  host?: HostConfig | null;
  onConnectHost?: () => void;
  debug?: {
    host: HostConfig | null;
    files: string[];
    activeFilePath: string;
    breakpoints: DebugBreakpoint[];
    onOpenFile?: (path: string) => void;
  };
}

function RealTerminal({ host, isDark }: { host: HostConfig; isDark: boolean }) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [status, setStatus] = useState<'connecting' | 'live' | 'closed' | 'error'>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let disposed = false;
    let observer: ResizeObserver | null = null;
    let term: XTerm | null = null;
    let fit: FitAddon | null = null;
    let ws: WebSocket | null = null;
    const disposers: Array<() => void> = [];

    setStatus('connecting');
    setError(null);

    void (async () => {
      try {
        const [{ Terminal: XTermCtor }, { FitAddon: FitAddonCtor }] = await Promise.all([
          import('@xterm/xterm'),
          import('@xterm/addon-fit'),
        ]);
        await import('@xterm/xterm/css/xterm.css');
        if (disposed || !mountRef.current) return;

        term = new XTermCtor({
          convertEol: false,
          cursorBlink: true,
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
          fontSize: 12,
          lineHeight: 1.2,
          scrollback: 5000,
          theme: isDark
            ? { background: '#18181b', foreground: '#d4d4d8', cursor: '#f87171', selectionBackground: '#3f3f46' }
            : { background: '#fbfbfd', foreground: '#27272a', cursor: '#dc2626', selectionBackground: '#e4e4e7' },
        });
        fit = new FitAddonCtor();
        term.loadAddon(fit);
        term.open(mountRef.current);
        fit.fit();
        termRef.current = term;
        fitRef.current = fit;

        term.writeln(`\x1b[90mConnecting to ${host.url}…\x1b[0m`);

        ws = new WebSocket(wsUrl(host));
        const socket = ws;
        socket.onopen = () => {
          if (disposed) return;
          setStatus('live');
          term?.focus();
          try {
            fit?.fit();
          } catch {
            /* not laid out yet */
          }
          if (term) socket.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
        };
        socket.onmessage = (event) => {
          let msg: { type?: string; data?: string; code?: number; reason?: string; shell?: string; cwd?: string } | null = null;
          try {
            msg = JSON.parse(String(event.data));
          } catch {
            return;
          }
          if (msg?.type === 'output' && typeof msg.data === 'string') term?.write(msg.data);
          else if (msg?.type === 'ready') {
            term?.writeln(`\x1b[90m${msg.shell ?? 'shell'} · ${msg.cwd ?? ''}\x1b[0m`);
          } else if (msg?.type === 'exit') {
            setStatus('closed');
            term?.writeln(
              `\r\n\x1b[90m[${msg.reason === 'idle' ? 'idle timeout' : `exited ${msg.code ?? ''}`}]\x1b[0m`,
            );
          }
        };
        socket.onerror = () => {
          if (disposed) return;
          setStatus('error');
          setError('Could not open the terminal socket. Check the host URL and token.');
        };
        socket.onclose = () => {
          if (disposed) return;
          setStatus((prev) => (prev === 'error' ? prev : 'closed'));
          term?.writeln('\r\n\x1b[90mDisconnected. Reconnect starts a new shell.\x1b[0m');
        };

        const dataSub = term.onData((data) => {
          if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'input', data }));
        });
        const resizeSub = term.onResize(({ cols, rows }) => {
          if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'resize', cols, rows }));
        });
        disposers.push(() => dataSub.dispose(), () => resizeSub.dispose());

        observer = new ResizeObserver(() => {
          try {
            fit?.fit();
          } catch {
            /* container collapsed */
          }
        });
        observer.observe(mountRef.current);
      } catch (e) {
        if (!disposed) {
          setStatus('error');
          setError((e as Error).message);
        }
      }
    })();

    return () => {
      disposed = true;
      observer?.disconnect();
      for (const dispose of disposers) dispose();
      ws?.close();
      term?.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // The shell is re-created only when the host or an explicit reconnect changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host.url, host.token, attempt]);

  useEffect(() => {
    if (!termRef.current) return;
    termRef.current.options.theme = isDark
      ? { background: '#18181b', foreground: '#d4d4d8', cursor: '#f87171', selectionBackground: '#3f3f46' }
      : { background: '#fbfbfd', foreground: '#27272a', cursor: '#dc2626', selectionBackground: '#e4e4e7' };
  }, [isDark]);

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="flex items-center gap-2 pb-1 mb-1 border-b border-neutral-200/50 dark:border-neutral-800 text-[10.5px]">
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full ${
            status === 'live'
              ? 'bg-emerald-500'
              : status === 'connecting'
              ? 'bg-amber-500 animate-pulse'
              : 'bg-neutral-400'
          }`}
        />
        <span className="font-mono truncate max-w-[50%]">{host.url}</span>
        <span className="text-neutral-400">
          {status === 'live' ? 'live shell' : status === 'connecting' ? 'connecting…' : status === 'error' ? 'error' : 'disconnected'}
        </span>
        <div className="flex-1" />
        <button
          onClick={() => termRef.current?.clear()}
          className="p-0.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
          title="Clear terminal"
        >
          <Eraser size={12} />
        </button>
        <button
          onClick={() => setAttempt((n) => n + 1)}
          className="p-0.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
          title="Reconnect"
        >
          <RotateCw size={12} />
        </button>
      </div>
      {error && <div className="text-[10.5px] text-red-500 pb-1">{error}</div>}
      <div ref={mountRef} className="flex-1 min-h-0" />
    </div>
  );
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
  completions,
  remoteLine,
  host,
  onConnectHost,
  debug,
}) => {
  const isDark = theme === 'dark';
  const [activeTab, setActiveTab] = useState<'benchmarks' | 'terminal' | 'debug' | 'logs'>('benchmarks');
  const [isBenchmarking, setIsBenchmarking] = useState(false);
  const [terminalLogs, setTerminalLogs] = useState<string[]>(
    () => initialLogs ?? ['Connected. Type `run [entry]`, `ls`, `cat <file>`, `open <file>`, `status`, or `help`.'],
  );
  const [termInput, setTermInput] = useState('');
  const [busy, setBusy] = useState(false);
  // Command recall (↑/↓) — session-local, newest last.
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState<number | null>(null);

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
    setHistory((prev) => [...prev.slice(-99), cmd]);
    setHistIdx(null);
    if (cmd.toLowerCase() === 'clear') {
      setTerminalLogs([]);
      return;
    }
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
        isOpen ? 'h-64' : 'h-7'
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
                  ? 'text-white border-b-2 border-red-500 font-semibold'
                  : 'text-neutral-900 border-b-2 border-red-500 font-semibold'
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
                  ? 'text-white border-b-2 border-red-500 font-semibold'
                  : 'text-neutral-900 border-b-2 border-red-500 font-semibold'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            <Terminal size={12} className="text-red-500" />
            <span>Console</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('debug');
              if (!isOpen) onToggle();
            }}
            className={`flex items-center gap-1.5 pb-0.5 transition-colors cursor-pointer ${
              activeTab === 'debug' && isOpen
                ? isDark
                  ? 'text-white border-b-2 border-red-500 font-semibold'
                  : 'text-neutral-900 border-b-2 border-red-500 font-semibold'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            <Bug size={12} className="text-amber-500" />
            <span>Debug</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('logs');
              if (!isOpen) onToggle();
            }}
            className={`flex items-center gap-1.5 pb-0.5 transition-colors cursor-pointer ${
              activeTab === 'logs' && isOpen
                ? isDark
                  ? 'text-white border-b-2 border-red-500 font-semibold'
                  : 'text-neutral-900 border-b-2 border-red-500 font-semibold'
                : 'text-neutral-500 hover:text-neutral-700'
            }`}
          >
            <FileText size={12} className="text-red-500" />
            <span>Telemetry</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          {onConnectHost && (
            <button
              onClick={onConnectHost}
              className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] cursor-pointer ${
                host
                  ? 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10'
                  : 'text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
              }`}
              title={host ? 'Host connected — manage' : 'Connect a zut host for a real shell'}
            >
              <Server size={11} />
              <span>{host ? 'Host' : 'Connect host'}</span>
            </button>
          )}
          {/* Toggle Collapse */}
          <button
            onClick={onToggle}
            className="text-neutral-400 hover:text-neutral-700 p-0.5 rounded cursor-pointer"
            title={isOpen ? 'Collapse drawer' : 'Expand drawer'}
          >
            {isOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>

      {/* Drawer Content */}
      {isOpen && (
        <div
          className={`flex-1 min-h-0 p-3 text-xs ${
            (activeTab === 'terminal' && host) || activeTab === 'debug' ? 'overflow-hidden' : 'overflow-y-auto'
          }`}
        >
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
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-red-600 hover:bg-red-500 text-white font-medium shadow-xs transition-colors text-[11px]"
                >
                  <Play size={11} className={isBenchmarking ? 'animate-spin' : ''} />
                  <span>{isBenchmarking ? 'Refreshing...' : 'Refresh'}</span>
                </button>
                )}
              </div>

              {/* Metric Cards Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
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
                    <Clock size={12} className="text-red-500" />
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
                    <Cpu size={12} className="text-red-500" />
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

          {activeTab === 'terminal' && host && (
            <div className="h-full min-h-0">
              <RealTerminal host={host} isDark={isDark} />
            </div>
          )}

          {activeTab === 'debug' && (
            <div className="h-full min-h-0">
              <React.Suspense
                fallback={<div className="h-full grid place-content-center text-[11px] text-neutral-400">Loading debugger…</div>}
              >
                <DebugPanel
                  host={debug?.host ?? host ?? null}
                  files={debug?.files ?? []}
                  activeFilePath={debug?.activeFilePath ?? ''}
                  breakpoints={debug?.breakpoints ?? []}
                  onConnectHost={onConnectHost}
                  onOpenFile={debug?.onOpenFile}
                  theme={theme}
                />
              </React.Suspense>
            </div>
          )}

          {activeTab === 'terminal' && !host && (
            <div className="h-full flex flex-col justify-between font-code text-[11.5px]">
              {remoteLine && (
                <div className="text-[10.5px] text-neutral-400 border-b border-neutral-200/50 dark:border-neutral-800 pb-1 mb-1">
                  {remoteLine}
                </div>
              )}
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
                  onChange={(e) => {
                    setTermInput(e.target.value);
                    setHistIdx(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      if (history.length === 0) return;
                      const next = histIdx === null ? history.length - 1 : Math.max(0, histIdx - 1);
                      setHistIdx(next);
                      setTermInput(history[next] ?? '');
                    } else if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      if (histIdx === null) return;
                      const next = histIdx + 1;
                      if (next >= history.length) {
                        setHistIdx(null);
                        setTermInput('');
                      } else {
                        setHistIdx(next);
                        setTermInput(history[next] ?? '');
                      }
                    } else if (e.key === 'Tab' && completions && completions.length > 0) {
                      e.preventDefault();
                      const parts = termInput.split(/\s+/);
                      const frag = parts[parts.length - 1] ?? '';
                      if (!frag) return;
                      // Lazy to avoid pulling terminal core into the initial chunk.
                      void import('../lib/terminal').then(({ completeToken }) => {
                        const done = completeToken(frag, completions);
                        if (done) {
                          parts[parts.length - 1] = done;
                          setTermInput(parts.join(' '));
                        }
                      });
                    }
                  }}
                  placeholder="run [entry], ls, cat, open, status, help…"
                  className="flex-1 bg-transparent focus:outline-none text-neutral-800 dark:text-neutral-100 placeholder-neutral-400 max-sm:text-base"
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
