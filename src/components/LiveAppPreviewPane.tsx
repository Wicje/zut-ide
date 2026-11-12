import React, { useState } from 'react';
import {
  Monitor,
  Tablet,
  Smartphone,
  RefreshCw,
  ExternalLink,
  AppWindow,
  Target,
  Terminal,
  ChevronDown,
  ArrowLeft,
  ArrowRight,
  RotateCw,
  Check,
} from 'lucide-react';
import { DeviceViewport } from '../types';
import mark from '../assets/zut-mark.png';

export interface PreviewNetworkEntry {
  method: string;
  url: string;
  status: number;
  ms: number;
}

interface LiveAppPreviewPaneProps {
  onInspectElement: (elementInfo: { component: string; file: string; line: number }) => void;
  onSwitchToDiff: () => void;
  theme?: 'light' | 'dark';
  /** Real bundled preview HTML. Absent = honest empty state (no fake app). */
  srcDoc?: string | null;
  /** Remote live URL (Cells dev server). Shows an "open live" action when set. */
  previewUrl?: string | null;
  previewLabel?: string;
  onOpenLiveUrl?: (url: string) => void;
  onReloadPreview?: () => void;
  /** Real console lines streamed from the preview harness. */
  consoleLines?: string[];
  /** Network requests streamed from the preview harness. */
  networkEvents?: PreviewNetworkEntry[];
  onClearNetwork?: () => void;
}

type ShellKind = 'fluid' | 'tablet' | 'phone';

interface DevicePreset {
  id: DeviceViewport;
  label: string;
  short: string;
  width: number | null;
  height: number | null;
  shell: ShellKind;
}

const DEVICES: DevicePreset[] = [
  { id: 'desktop', label: 'Desktop (fluid)', short: 'Desktop', width: null, height: null, shell: 'fluid' },
  { id: 'laptop', label: 'Laptop · 1280 × 800', short: 'Laptop', width: 1280, height: 800, shell: 'fluid' },
  { id: 'tablet', label: 'iPad · 768 × 1024', short: 'iPad', width: 768, height: 1024, shell: 'tablet' },
  { id: 'mobile', label: 'iPhone 15 Pro · 393 × 852', short: 'iPhone 15 Pro', width: 393, height: 852, shell: 'phone' },
  { id: 'pixel', label: 'Pixel 8 · 412 × 915', short: 'Pixel 8', width: 412, height: 915, shell: 'phone' },
  { id: 'iphone-se', label: 'iPhone SE · 375 × 667', short: 'iPhone SE', width: 375, height: 667, shell: 'phone' },
];

function deviceIcon(shell: ShellKind, size: number) {
  if (shell === 'phone') return <Smartphone size={size} />;
  if (shell === 'tablet') return <Tablet size={size} />;
  return <Monitor size={size} />;
}

export const LiveAppPreviewPane: React.FC<LiveAppPreviewPaneProps> = ({
  onInspectElement,
  onSwitchToDiff,
  theme = 'light',
  srcDoc,
  previewUrl,
  previewLabel,
  onReloadPreview,
  onOpenLiveUrl,
  consoleLines,
  networkEvents,
  onClearNetwork,
}) => {
  const isDark = theme === 'dark';
  const [viewport, setViewport] = useState<DeviceViewport>('desktop');
  const [rotated, setRotated] = useState(false);
  const [isDeviceMenuOpen, setIsDeviceMenuOpen] = useState(false);
  const [isInspectMode, setIsInspectMode] = useState(false);
  const hasLivePreview = Boolean(srcDoc);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<'console' | 'network'>('console');
  const [consoleFilter, setConsoleFilter] = useState<'all' | 'error' | 'warn'>('all');
  const [consoleLogs, setConsoleLogs] = useState<string[]>(() => consoleLines ?? []);
  const [networkLogs, setNetworkLogs] = useState<PreviewNetworkEntry[]>(() => networkEvents ?? []);
  const frameRef = React.useRef<HTMLIFrameElement | null>(null);
  const seenConsoleCount = React.useRef((consoleLines ?? []).length);
  const seenNetworkCount = React.useRef((networkEvents ?? []).length);

  React.useEffect(() => {
    const lines = consoleLines ?? [];
    if (lines.length > seenConsoleCount.current) {
      setConsoleLogs((prev) => [...prev.slice(-200), ...lines.slice(seenConsoleCount.current)]);
      seenConsoleCount.current = lines.length;
    } else if (lines.length === 0 && seenConsoleCount.current !== 0) {
      setConsoleLogs([]);
      seenConsoleCount.current = 0;
    }
  }, [consoleLines]);

  React.useEffect(() => {
    const lines = networkEvents ?? [];
    if (lines.length > seenNetworkCount.current) {
      setNetworkLogs((prev) => [...prev.slice(-99), ...lines.slice(seenNetworkCount.current)]);
      seenNetworkCount.current = lines.length;
    } else if (lines.length === 0 && seenNetworkCount.current !== 0) {
      setNetworkLogs([]);
      seenNetworkCount.current = 0;
    }
  }, [networkEvents]);

  const errorCount = consoleLogs.filter((l) => l.startsWith('[error]')).length;
  const warnCount = consoleLogs.filter((l) => l.startsWith('[warn]')).length;
  const filteredConsole = consoleLogs.filter((l) =>
    consoleFilter === 'all' ? true : consoleFilter === 'error' ? l.startsWith('[error]') : l.startsWith('[warn]'),
  );

  const device = DEVICES.find((d) => d.id === viewport) ?? DEVICES[0];
  const constrained = device.width !== null;
  const frameWidth = constrained ? (rotated ? device.height! : device.width!) : null;
  const frameHeight = constrained ? (rotated ? device.width! : device.height!) : null;

  const openInNewTab = () => {
    if (!srcDoc) return;
    const url = URL.createObjectURL(new Blob([srcDoc], { type: 'text/html' }));
    window.open(url, '_blank', 'noopener');
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  };

  const clearActiveDrawer = () => {
    if (drawerTab === 'console') {
      setConsoleLogs([]);
    } else {
      setNetworkLogs([]);
      seenNetworkCount.current = networkEvents?.length ?? 0;
      onClearNetwork?.();
    }
  };

  return (
    <div
      className={`flex-1 flex flex-col justify-between overflow-hidden select-none text-[13px] transition-colors ${
        isDark ? 'bg-[#18181b] text-neutral-200' : 'bg-[#f4f4f6] text-neutral-800'
      }`}
    >
      {/* Top Browser Bar */}
      <div
        className={`h-10 px-3.5 border-b flex items-center justify-between gap-2 ${
          isDark ? 'border-neutral-800 bg-[#161619]' : 'border-[#e5e5e7] bg-white'
        }`}
      >
        {/* Left: URL bar — back, forward, reload, address. Phones drop the
            history arrows so the address and the controls share one row. */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1 sm:flex-none">
          <button
            onClick={() => frameRef.current?.contentWindow?.history.back()}
            className="p-1 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer text-neutral-400 hidden sm:inline-flex"
            title="Back"
          >
            <ArrowLeft size={13} />
          </button>
          <button
            onClick={() => frameRef.current?.contentWindow?.history.forward()}
            className="p-1 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer text-neutral-400 hidden sm:inline-flex"
            title="Forward"
          >
            <ArrowRight size={13} />
          </button>
          {onReloadPreview && (
          <button
            onClick={onReloadPreview}
            className="p-1 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer text-neutral-400"
            title="Rebuild Preview"
          >
            <RefreshCw size={13} />
          </button>
          )}

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#f4f4f6] dark:bg-neutral-800 text-[11px] font-mono text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-800 min-w-0 flex-1 max-w-none sm:max-w-[320px]">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span className="truncate">{previewUrl ?? previewLabel ?? (hasLivePreview ? 'preview (sandboxed)' : 'no preview')}</span>
          </div>

          {previewUrl && (
          <button
            onClick={() => onOpenLiveUrl?.(previewUrl)}
            className="p-1 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer text-neutral-400"
            title={`Open live URL: ${previewUrl}`}
          >
            <ExternalLink size={13} />
          </button>
          )}
          {!previewUrl && hasLivePreview && (
          <button
            onClick={openInNewTab}
            className="p-1 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer text-neutral-400"
            title="Open preview in a new tab"
          >
            <AppWindow size={13} />
          </button>
          )}
        </div>

        {/* Center: viewport preset + rotate */}
        <div className="flex items-center gap-1 shrink-0">
          <div className="relative">
            <button
              onClick={() => setIsDeviceMenuOpen((v) => !v)}
              className="flex items-center gap-1.5 h-7 pl-2 pr-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 bg-[#f4f4f6] dark:bg-neutral-800 text-[11px] font-medium text-neutral-600 dark:text-neutral-200 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer"
              title="Viewport preset"
            >
              {deviceIcon(device.shell, 13)}
              <span className="hidden md:inline max-w-[150px] truncate">{device.short}</span>
              <ChevronDown size={12} className="text-neutral-400" />
            </button>
            {isDeviceMenuOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setIsDeviceMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1.5 z-30 w-64 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-[#222228] shadow-xl py-1">
                  <div className="px-2.5 py-1 text-[10px] font-semibold text-neutral-400 uppercase tracking-[0.08em]">
                    Viewport
                  </div>
                  {DEVICES.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => {
                        setViewport(d.id);
                        setRotated(false);
                        setIsDeviceMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-left text-neutral-600 dark:text-neutral-200 hover:bg-[#f4f4f6] dark:hover:bg-neutral-800 cursor-pointer"
                    >
                      <span className="text-neutral-400">{deviceIcon(d.shell, 13)}</span>
                      <span className="flex-1 truncate">{d.label}</span>
                      {viewport === d.id && <Check size={12} className="text-red-500 shrink-0" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          {constrained && (
            <button
              onClick={() => setRotated((v) => !v)}
              className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer"
              title={rotated ? 'Rotate to portrait' : 'Rotate to landscape'}
            >
              <RotateCw size={13} />
            </button>
          )}
        </div>

        {/* Right: Inspect Element & Console */}
        <div className="flex items-center gap-2">
          {/* Inspect Mode Toggle (hidden for live previews: sandboxed iframes can't be introspected) */}
          {!hasLivePreview && (
          <button
            onClick={() => setIsInspectMode(!isInspectMode)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
              isInspectMode
                ? 'bg-red-600 text-white shadow-sm animate-pulse'
                : isDark
                ? 'bg-[#24242a] text-neutral-300 hover:text-white'
                : 'bg-[#f4f4f6] text-neutral-700 hover:text-neutral-900'
            }`}
            title="Click an element to inspect and send to Composer"
          >
            <Target size={13} />
            <span className="hidden sm:inline">{isInspectMode ? 'Click an element...' : 'Inspect'}</span>
          </button>
          )}

          <button
            onClick={() => setIsConsoleOpen(!isConsoleOpen)}
            className={`relative p-1.5 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-white transition-colors cursor-pointer ${
              isConsoleOpen ? 'text-red-500' : ''
            }`}
            title="Toggle Browser Console"
          >
            <Terminal size={14} />
            {errorCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-3.5 min-w-3.5 px-0.5 rounded-full bg-red-600 text-[10px] leading-[14px] text-white text-center">
                {errorCount > 9 ? '9+' : errorCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Preview Viewport Canvas */}
      {hasLivePreview ? (
        <div className="flex-1 overflow-hidden p-4 flex items-center justify-center">
          <div
            className={`transition-all duration-300 rounded-xl overflow-hidden shadow-xl border ${
              isDark ? 'bg-[#1e1e24] border-neutral-800' : 'bg-white border-neutral-200'
            } flex flex-col ${constrained ? '' : 'w-full h-full'}`}
            style={constrained ? { width: frameWidth!, height: frameHeight!, maxWidth: '100%', maxHeight: '100%' } : undefined}
          >
            <iframe
              ref={frameRef}
              title="preview"
              srcDoc={srcDoc ?? ''}
              sandbox="allow-scripts allow-forms allow-modals allow-popups"
              className="h-full w-full border-0 bg-white"
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto grid place-content-center p-6">
          <div className="flex flex-col items-center gap-3 text-center select-none">
            <img
              src={mark}
              alt=""
              className={`h-8 w-8 opacity-50 ${isDark ? 'brightness-0 invert' : ''}`}
            />
            <p className="text-[13px] font-medium text-neutral-500 dark:text-neutral-400">No preview yet</p>
            <p className="text-[11px] leading-[1.5] text-neutral-400 max-w-[300px]">
              Create an index.html and press Run — the page renders here, with console and network alongside.
            </p>
            <span className="flex items-center gap-1 mt-1 text-[10px] text-neutral-400">
              <kbd className="px-1.5 py-0.5 rounded border border-neutral-300 dark:border-neutral-800 font-mono text-[10px]">⌘3</kbd>Preview
              <span className="text-neutral-300 dark:text-neutral-600">·</span>
              <kbd className="px-1.5 py-0.5 rounded border border-neutral-300 dark:border-neutral-800 font-mono text-[10px]">⌘1</kbd>Review
              <span className="text-neutral-300 dark:text-neutral-600">·</span>
              <kbd className="px-1.5 py-0.5 rounded border border-neutral-300 dark:border-neutral-800 font-mono text-[10px]">⌘2</kbd>Code
            </span>
          </div>
        </div>
      )}

      {/* Embedded Console / Network Drawer */}
      {isConsoleOpen && (
        <div
          className={`h-40 border-t flex flex-col font-code text-[10px] ${
            isDark ? 'bg-black/80 border-neutral-800 text-neutral-300' : 'bg-neutral-900 text-neutral-200 border-neutral-800'
          }`}
        >
          <div className="flex items-center gap-1 px-2.5 h-8 shrink-0 border-b border-neutral-800">
            <button
              onClick={() => setDrawerTab('console')}
              className={`px-2 h-6 rounded text-[10px] font-semibold tracking-[0.08em] uppercase transition-colors cursor-pointer ${
                drawerTab === 'console' ? 'text-white bg-white/10' : 'text-neutral-500 hover:text-neutral-200'
              }`}
            >
              Console{consoleLogs.length > 0 ? ` · ${consoleLogs.length}` : ''}
            </button>
            <button
              onClick={() => setDrawerTab('network')}
              className={`px-2 h-6 rounded text-[10px] font-semibold tracking-[0.08em] uppercase transition-colors cursor-pointer ${
                drawerTab === 'network' ? 'text-white bg-white/10' : 'text-neutral-500 hover:text-neutral-200'
              }`}
            >
              Network{networkLogs.length > 0 ? ` · ${networkLogs.length}` : ''}
            </button>

            <div className="flex-1" />

            {drawerTab === 'console' && (
              <div className="flex items-center gap-1">
                {(['all', 'error', 'warn'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setConsoleFilter(f)}
                    className={`px-1.5 h-5 rounded text-[10px] font-semibold uppercase tracking-wide transition-colors cursor-pointer ${
                      consoleFilter === f
                        ? f === 'error'
                          ? 'bg-red-600 text-white'
                          : f === 'warn'
                          ? 'bg-amber-500 text-black'
                          : 'bg-white/15 text-white'
                        : 'text-neutral-500 hover:text-neutral-200'
                    }`}
                  >
                    {f === 'all' ? `All ${consoleLogs.length}` : f === 'error' ? `Errors ${errorCount}` : `Warnings ${warnCount}`}
                  </button>
                ))}
              </div>
            )}
            <button onClick={clearActiveDrawer} className="px-1.5 h-5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500 hover:text-white cursor-pointer">
              Clear
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {drawerTab === 'console' &&
              (filteredConsole.length === 0 ? (
                <p className="px-1 py-2 text-neutral-500">
                  {consoleLogs.length === 0 ? 'Console output from the preview lands here.' : 'Nothing matches this filter.'}
                </p>
              ) : (
                filteredConsole.map((log, i) => (
                  <div
                    key={i}
                    className={`leading-[1.35] px-1 whitespace-pre-wrap break-all ${
                      log.startsWith('[error]') ? 'text-red-400' : log.startsWith('[warn]') ? 'text-amber-300' : ''
                    }`}
                  >
                    {log}
                  </div>
                ))
              ))}
            {drawerTab === 'network' &&
              (networkLogs.length === 0 ? (
                <p className="px-1 py-2 text-neutral-500">fetch() and XMLHttpRequest calls from the preview land here.</p>
              ) : (
                networkLogs.map((n, i) => (
                  <div key={i} className="flex items-center gap-2 px-1 leading-[1.5]">
                    <span className="w-9 shrink-0 font-semibold text-neutral-400">{n.method}</span>
                    <span className={`w-7 shrink-0 ${n.status >= 400 || n.status === 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                      {n.status === 0 ? 'ERR' : n.status}
                    </span>
                    <span className="truncate text-neutral-300" title={n.url}>{n.url}</span>
                    <span className="ml-auto shrink-0 text-neutral-500">{n.ms}ms</span>
                  </div>
                ))
              ))}
          </div>
        </div>
      )}
    </div>
  );
};
