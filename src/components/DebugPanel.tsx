import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bug,
  Play,
  Square,
  StepForward,
  ArrowDownToLine,
  ArrowUpFromLine,
  RotateCw,
  Server,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import {
  DebugClient,
  type DebugBreakpoint,
  type DebugEvent,
  type DebugFrame,
  type DebugScope,
} from '../lib/debugClient';
import type { HostConfig } from '../lib/host';

interface DebugPanelProps {
  host: HostConfig | null;
  files: string[];
  activeFilePath: string;
  breakpoints: DebugBreakpoint[];
  onConnectHost?: () => void;
  onOpenFile?: (path: string) => void;
  theme?: 'light' | 'dark';
}

type Status = 'idle' | 'starting' | 'running' | 'paused' | 'exited' | 'error';

const SCRIPT_RE = /\.(js|mjs|cjs|ts|mts|cts)$/i;

function isScript(path: string): boolean {
  return SCRIPT_RE.test(path);
}

function shortPath(path: string): string {
  const parts = path.split('/');
  return parts.slice(-2).join('/');
}

/** The debugger reports absolute host paths; the IDE keys files relatively. */
function workspacePath(absolutePath: string, files: string[]): string {
  const normal = absolutePath.replace(/\\/g, '/');
  if (files.includes(normal)) return normal;
  const matches = files.filter((file) => normal.endsWith(`/${file}`));
  return matches.sort((a, b) => b.length - a.length)[0] ?? absolutePath;
}

export const DebugPanel: React.FC<DebugPanelProps> = ({
  host,
  files,
  activeFilePath,
  breakpoints,
  onConnectHost,
  onOpenFile,
  theme = 'light',
}) => {
  const isDark = theme === 'dark';
  const [client, setClient] = useState<DebugClient | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [entry, setEntry] = useState('');
  const [frames, setFrames] = useState<DebugFrame[]>([]);
  const [scopes, setScopes] = useState<DebugScope[]>([]);
  const [selectedFrame, setSelectedFrame] = useState(0);
  const [output, setOutput] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expression, setExpression] = useState('');
  const [evalResult, setEvalResult] = useState<string | null>(null);
  const [verified, setVerified] = useState<Array<DebugBreakpoint & { verified: boolean }>>([]);
  const [showConsole, setShowConsole] = useState(true);
  const outputRef = useRef<HTMLDivElement | null>(null);

  const scripts = useMemo(() => files.filter(isScript).sort(), [files]);

  useEffect(() => {
    const preferred = isScript(activeFilePath)
      ? activeFilePath
      : scripts.find((p) => /(^|\/)(main|index|app|server)\.(m?js|cjs)$/i.test(p)) ?? scripts[0] ?? '';
    setEntry((prev) => (prev && scripts.includes(prev) ? prev : preferred));
  }, [activeFilePath, scripts]);

  useEffect(() => {
    if (!host) {
      setClient(null);
      return;
    }
    const instance = new DebugClient(host);
    setClient(instance);
    setStatus('idle');
    setFrames([]);
    setScopes([]);
    setOutput([]);
    setError(null);
    setVerified([]);
    return () => {
      instance.close();
      setClient(null);
    };
  }, [host]);

  useEffect(() => {
    if (!client) return;
    return client.onEvent((event: DebugEvent) => {
      if (event.type === 'output') {
        const text = event.data.replace(/\r/g, '').split('\n').filter(Boolean).slice(0, 20);
        setOutput((prev) => [...prev.slice(-300), ...text.map((line) => (event.stream === 'stderr' ? `! ${line}` : line))]);
        return;
      }
      if (event.type === 'console') {
        setOutput((prev) => [...prev.slice(-300), `[${event.level}] ${event.text}`]);
        return;
      }
      if (event.type === 'started') {
        setStatus('running');
        setError(null);
        return;
      }
      if (event.type === 'breakpoints') {
        setVerified(event.breakpoints);
        return;
      }
      if (event.type === 'paused') {
        setStatus('paused');
        setFrames(event.frames);
        setScopes(event.scopes);
        setSelectedFrame(0);
        setEvalResult(null);
        return;
      }
      if (event.type === 'resumed') {
        setStatus('running');
        setFrames([]);
        setScopes([]);
        return;
      }
      if (event.type === 'exit') {
        setStatus('exited');
        setFrames([]);
        setScopes([]);
        setOutput((prev) => [...prev.slice(-300), `Process exited (${event.code ?? event.signal ?? '?'}).`]);
        return;
      }
      if (event.type === 'closed') {
        setStatus((prev) => (prev === 'error' ? prev : 'exited'));
        setFrames([]);
        setScopes([]);
      }
    });
  }, [client]);

  useEffect(() => {
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight });
  }, [output]);

  useEffect(() => {
    if (!client || status === 'idle' || status === 'starting' || status === 'exited') return;
    void client.setBreakpoints(breakpoints).catch(() => {});
    // Breakpoints are re-sent on every change while a session is live.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [breakpoints, client]);

  async function start() {
    if (!client || !entry) return;
    setStatus('starting');
    setError(null);
    setOutput([]);
    setVerified([]);
    try {
      await client.ready;
      await client.start(entry, true);
      if (breakpoints.length > 0) await client.setBreakpoints(breakpoints);
    } catch (e) {
      setError((e as Error).message);
      setStatus('error');
    }
  }

  async function control(command: string) {
    if (!client) return;
    try {
      await client.command(command);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function evaluate(event: React.FormEvent) {
    event.preventDefault();
    if (!client || !expression.trim()) return;
    try {
      const r = await client.evaluate(expression.trim(), frames[selectedFrame]?.id);
      setEvalResult(`${r.value}${r.type && r.type !== 'undefined' ? ` (${r.type})` : ''}`);
    } catch (e) {
      setEvalResult(`error: ${(e as Error).message}`);
    }
  }

  async function stop() {
    if (!client) return;
    try {
      await client.stop();
    } catch {
      /* already gone */
    }
    setStatus('idle');
    setFrames([]);
    setScopes([]);
  }

  if (!host) {
    return (
      <div className="h-full grid place-content-center text-center gap-2 text-[11.5px] text-neutral-500">
        <Bug size={18} className="mx-auto text-neutral-400" />
        <div>Connect a host to debug Node scripts (.js / .ts).</div>
        {onConnectHost && (
          <button
            onClick={onConnectHost}
            className="mx-auto flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-white/5"
          >
            <Server size={12} /> Connect host
          </button>
        )}
      </div>
    );
  }

  const paused = status === 'paused';
  const live = status === 'running' || status === 'paused';
  const selected = frames[selectedFrame];

  return (
    <div className="h-full min-h-0 flex gap-3 font-code text-[11px]">
      <div className="w-56 shrink-0 flex flex-col min-h-0">
        <div className="flex items-center gap-1 pb-1.5">
          <select
            value={entry}
            onChange={(e) => setEntry(e.target.value)}
            disabled={live || status === 'starting'}
            className={`h-7 min-w-0 flex-1 rounded border px-1.5 text-[10.5px] font-mono ${
              isDark
                ? 'bg-[#202025] border-neutral-700 text-neutral-200'
                : 'bg-white border-neutral-300 text-neutral-800'
            }`}
            title="Entry script"
          >
            {scripts.length === 0 && <option value="">No JS files</option>}
            {scripts.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          {live ? (
            <button
              onClick={() => void stop()}
              className="h-7 w-7 grid place-content-center rounded bg-red-600 text-white hover:bg-red-500"
              title="Stop"
            >
              <Square size={11} />
            </button>
          ) : (
            <button
              onClick={() => void start()}
              disabled={!entry || status === 'starting'}
              className="h-7 w-7 grid place-content-center rounded bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40"
              title="Start debugging (pauses on entry)"
            >
              <Play size={11} />
            </button>
          )}
          <button
            onClick={() => void start()}
            disabled={live || !entry}
            className="h-7 w-7 grid place-content-center rounded border border-neutral-300 dark:border-neutral-700 disabled:opacity-40"
            title="Restart"
          >
            <RotateCw size={11} />
          </button>
        </div>

        <div className="flex items-center gap-1 pb-1.5">
          <button
            onClick={() => void control('continue')}
            disabled={!paused}
            className="flex-1 h-6 rounded border border-neutral-300 dark:border-neutral-700 text-[10px] disabled:opacity-35 hover:bg-neutral-50 dark:hover:bg-white/5"
          >
            Continue
          </button>
          <button
            onClick={() => void control('stepOver')}
            disabled={!paused}
            className="h-6 w-6 grid place-content-center rounded border border-neutral-300 dark:border-neutral-700 disabled:opacity-35"
            title="Step over"
          >
            <StepForward size={11} />
          </button>
          <button
            onClick={() => void control('stepInto')}
            disabled={!paused}
            className="h-6 w-6 grid place-content-center rounded border border-neutral-300 dark:border-neutral-700 disabled:opacity-35"
            title="Step into"
          >
            <ArrowDownToLine size={11} />
          </button>
          <button
            onClick={() => void control('stepOut')}
            disabled={!paused}
            className="h-6 w-6 grid place-content-center rounded border border-neutral-300 dark:border-neutral-700 disabled:opacity-35"
            title="Step out"
          >
            <ArrowUpFromLine size={11} />
          </button>
        </div>

        <div className="text-[10px] uppercase tracking-wide text-neutral-400 pb-1">
          Call stack {paused ? `· ${frames.length}` : ''}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto space-y-0.5">
          {!paused && (
            <div className="text-neutral-400">
              {status === 'running'
                ? 'Running…'
                : status === 'starting'
                ? 'Starting…'
                : status === 'exited'
                ? 'Process exited.'
                : 'Not debugging.'}
            </div>
          )}
          {frames.map((frame, i) => (
            <button
              key={frame.id}
              onClick={() => setSelectedFrame(i)}
              className={`w-full text-left px-1.5 py-1 rounded ${
                i === selectedFrame
                  ? isDark
                    ? 'bg-red-500/15 text-red-300'
                    : 'bg-red-500/10 text-red-700'
                  : 'hover:bg-neutral-500/10'
              }`}
            >
              <div className="truncate font-medium">{frame.functionName}</div>
              <div className="truncate text-[10px] text-neutral-400">
                {frame.path ? shortPath(frame.path) : frame.url}:{frame.line}
              </div>
            </button>
          ))}
        </div>

        {verified.some((b) => !b.verified) && (
          <div className="text-[9.5px] text-amber-500 pt-1">
            {verified.filter((b) => !b.verified).length} breakpoint(s) not bound — save the file first.
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 flex flex-col gap-1.5 min-h-0">
        {error && <div className="text-red-500 text-[10.5px]">{error}</div>}
        {paused && selected && (
          <button
            onClick={() => onOpenFile?.(workspacePath(selected.path, files))}
            className="text-left text-[10.5px] text-neutral-500 hover:text-red-500 truncate"
            title={selected.path}
          >
            Paused at {selected.path}:{selected.line}
          </button>
        )}

        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 gap-2 overflow-hidden">
          <div className="min-h-0 overflow-y-auto space-y-1.5">
            {scopes.length === 0 && <div className="text-neutral-400">Variables appear when paused.</div>}
            {scopes.map((scope, si) => (
              <div key={`${scope.type}-${si}`}>
                <div className="text-[10px] uppercase tracking-wide text-neutral-400">{scope.type}</div>
                {scope.variables.length === 0 && <div className="text-neutral-400 pl-1">—</div>}
                {scope.variables.map((v) => (
                  <div key={v.name} className="flex gap-1.5 pl-1 leading-5">
                    <span className="text-sky-600 dark:text-sky-400 shrink-0">{v.name}</span>
                    <span className="text-neutral-400">=</span>
                    <span className="truncate text-neutral-700 dark:text-neutral-200" title={String(v.value)}>
                      {String(v.value)}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="min-h-0 flex flex-col">
            <form onSubmit={evaluate} className="flex items-center gap-1 pb-1">
              <input
                value={expression}
                onChange={(e) => setExpression(e.target.value)}
                placeholder={paused ? 'Evaluate expression…' : 'Pause to evaluate'}
                disabled={!paused}
                className={`h-6 min-w-0 flex-1 rounded border px-1.5 font-mono text-[10.5px] focus:outline-none focus:ring-1 focus:ring-red-500 disabled:opacity-50 ${
                  isDark ? 'bg-[#202025] border-neutral-700' : 'bg-white border-neutral-300'
                }`}
              />
              <button
                type="submit"
                disabled={!paused || !expression.trim()}
                className="h-6 px-2 rounded bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-[10px] font-semibold disabled:opacity-40"
              >
                Eval
              </button>
            </form>
            {evalResult && (
              <div className="text-[10.5px] font-mono break-all text-emerald-600 dark:text-emerald-400 pb-1">
                {evalResult}
              </div>
            )}

            <button
              onClick={() => setShowConsole((v) => !v)}
              className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
            >
              {showConsole ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              Console · stdout/stderr
            </button>
            {showConsole && (
              <div ref={outputRef} className="flex-1 min-h-0 overflow-y-auto font-mono text-[10.5px] leading-4 text-neutral-600 dark:text-neutral-300">
                {output.length === 0 ? (
                  <div className="text-neutral-400">Program output appears here.</div>
                ) : (
                  output.map((line, i) => (
                    <div key={i} className={line.startsWith('! ') ? 'text-red-500' : undefined}>
                      {line}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
