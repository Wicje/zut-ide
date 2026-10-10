import React, { useState } from 'react';
import {
  Monitor,
  Tablet,
  Smartphone,
  RefreshCw,
  ExternalLink,
  Target,
  Sparkles,
  Terminal,
  CheckCircle2,
  Sliders,
  ChevronDown,
} from 'lucide-react';
import { DeviceViewport } from '../types';

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
}) => {
  const isDark = theme === 'dark';
  const [viewport, setViewport] = useState<DeviceViewport>('desktop');
  const [isInspectMode, setIsInspectMode] = useState(false);
  const [hoveredElement, setHoveredElement] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('tab-1');
  const hasLivePreview = Boolean(srcDoc);
  const [isCompact, setIsCompact] = useState(false);
  const [isConsoleOpen, setIsConsoleOpen] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<string[]>(() => consoleLines ?? []);
  const seenConsoleCount = React.useRef((consoleLines ?? []).length);
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

  const handleElementClick = (component: string, file: string, line: number) => {
    if (isInspectMode) {
      onInspectElement({ component, file, line });
      setIsInspectMode(false);
    }
  };

  const getContainerWidth = () => {
    switch (viewport) {
      case 'mobile':
        return 'max-w-[375px] h-[640px]';
      case 'tablet':
        return 'max-w-[768px] h-[600px]';
      case 'desktop':
      default:
        return 'w-full h-full';
    }
  };

  return (
    <div
      className={`flex-1 flex flex-col justify-between overflow-hidden select-none text-[13px] transition-colors ${
        isDark ? 'bg-[#18181b] text-neutral-200' : 'bg-[#f8f8fa] text-neutral-800'
      }`}
    >
      {/* Top Browser Bar */}
      <div
        className={`h-10 px-3.5 border-b flex items-center justify-between gap-2 overflow-x-auto ${
          isDark ? 'border-neutral-800 bg-[#161619]' : 'border-[#e5e5e7] bg-white'
        }`}
      >
        {/* Left: URL Bar */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-neutral-100 dark:bg-neutral-800 text-[11.5px] font-mono text-neutral-600 dark:text-neutral-300 border border-neutral-200 dark:border-neutral-700">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>{previewLabel ?? (hasLivePreview ? 'preview (sandboxed)' : 'no preview')}</span>
          </div>

          {onReloadPreview && (
          <button
            onClick={onReloadPreview}
            className="p-1 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer text-neutral-400"
            title="Rebuild Preview"
          >
            <RefreshCw size={13} />
          </button>
          )}
          {previewUrl && (
          <button
            onClick={() => onOpenLiveUrl?.(previewUrl)}
            className="p-1 hover:text-neutral-900 dark:hover:text-white transition-colors cursor-pointer text-neutral-400"
            title={`Open live URL: ${previewUrl}`}
          >
            <ExternalLink size={13} />
          </button>
          )}
        </div>

        {/* Center: Device Viewport Switcher */}
        <div className="flex items-center gap-1 shrink-0 bg-neutral-100 dark:bg-neutral-800 p-0.5 rounded-lg border border-neutral-200 dark:border-neutral-700">
          <button
            onClick={() => setViewport('desktop')}
            className={`p-1 rounded transition-colors cursor-pointer ${
              viewport === 'desktop'
                ? isDark
                  ? 'bg-neutral-700 text-white'
                  : 'bg-white text-neutral-900 shadow-xs'
                : 'text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
            }`}
            title="Desktop (100%)"
          >
            <Monitor size={13} />
          </button>
          <button
            onClick={() => setViewport('tablet')}
            className={`p-1 rounded transition-colors cursor-pointer ${
              viewport === 'tablet'
                ? isDark
                  ? 'bg-neutral-700 text-white'
                  : 'bg-white text-neutral-900 shadow-xs'
            : 'text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
            }`}
            title="Tablet (768px)"
          >
            <Tablet size={13} />
          </button>
          <button
            onClick={() => setViewport('mobile')}
            className={`p-1 rounded transition-colors cursor-pointer ${
              viewport === 'mobile'
                ? isDark
                  ? 'bg-neutral-700 text-white'
                  : 'bg-white text-neutral-900 shadow-xs'
            : 'text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'
            }`}
            title="Mobile (375px)"
          >
            <Smartphone size={13} />
          </button>
        </div>

        {/* Right: Inspect Element & Console */}
        <div className="flex items-center gap-2">
          {/* Inspect Mode Toggle (hidden for live previews: sandboxed iframes can't be introspected) */}
          {!hasLivePreview && (
          <button
            onClick={() => setIsInspectMode(!isInspectMode)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-medium transition-colors cursor-pointer border ${
              isInspectMode
                ? 'bg-red-600 text-white border-red-600 shadow-sm animate-pulse'
                : isDark
                ? 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:text-white'
                : 'bg-white border-neutral-300 text-neutral-700 hover:text-neutral-900'
            }`}
            title="Click an element to inspect and send to Composer"
          >
            <Target size={13} />
            <span>{isInspectMode ? 'Click an element...' : 'Inspect'}</span>
          </button>
          )}

          <button
            onClick={() => setIsConsoleOpen(!isConsoleOpen)}
            className={`p-1 rounded text-neutral-400 hover:text-neutral-700 dark:hover:text-white transition-colors cursor-pointer ${
              isConsoleOpen ? 'text-red-500' : ''
            }`}
            title="Toggle Browser Console"
          >
            <Terminal size={14} />
          </button>
        </div>
      </div>

      {/* Preview Viewport Canvas */}
      {hasLivePreview ? (
        <div className="flex-1 overflow-hidden p-4 flex items-center justify-center">
          <div
            className={`transition-all duration-300 rounded-xl overflow-hidden shadow-xl border ${
              isDark ? 'bg-[#1e1e24] border-neutral-700' : 'bg-white border-neutral-200'
            } ${getContainerWidth()} flex flex-col`}
          >
            <iframe
              title="preview"
              srcDoc={srcDoc ?? ''}
              sandbox="allow-scripts allow-forms allow-modals allow-popups"
              className="h-full w-full border-0 bg-white"
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-6 grid place-content-center">
          <div className="text-center space-y-1.5">
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">No preview yet</p>
            <p className="text-xs text-neutral-500">Open a web project and press Run to see it here.</p>
          </div>
        </div>
      )}

      {/* Embedded Console Drawer */}
      {isConsoleOpen && (
        <div
          className={`h-28 border-t p-2.5 font-code text-[11px] space-y-1 overflow-y-auto ${
            isDark ? 'bg-black/80 border-neutral-800 text-neutral-300' : 'bg-neutral-900 text-neutral-200 border-neutral-800'
          }`}
        >
          <div className="flex items-center justify-between text-neutral-400 text-[10px] pb-1 border-b border-neutral-800">
            <span>BROWSER CONSOLE</span>
            <button onClick={() => setConsoleLogs([])} className="hover:text-white">
              Clear
            </button>
          </div>
          {consoleLogs.map((log, i) => (
            <div key={i} className="leading-tight">{log}</div>
          ))}
        </div>
      )}
    </div>
  );
};
