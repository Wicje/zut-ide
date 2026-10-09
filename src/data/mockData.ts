import { DiffFile, SidebarSection, SessionData, ProjectFile } from '../types';

export const INITIAL_SECTIONS: SidebarSection[] = [
  {
    title: 'Cursor',
    items: [
      { id: 'composer-ghost', title: 'Composer ghost', category: 'Cursor' },
      { id: 'sidebar-reorderable', title: 'Sidebar reorderable', badge: 'blue', category: 'Cursor' },
      { id: 'agentic-chat', title: 'Agentic chat', badge: 'blue', hasIcon: true, iconType: 'card', category: 'Cursor' },
      { id: 'command-palette', title: 'Command palette', badge: 'gray', hasIcon: true, iconType: 'panel', category: 'Cursor' },
      { id: 'toast-notification', title: 'Toast notification', badge: 'gray', hasIcon: true, iconType: 'toast', category: 'Cursor' },
      { id: 'cursor-more', title: 'More', isMore: true, category: 'Cursor' },
    ],
  },
  {
    title: 'Anysphere',
    items: [
      { id: 'chat-model-routing', title: 'Chat model auto-routing', badge: 'gray', category: 'Anysphere' },
      { id: 'cloud-settings', title: 'Cloud settings catalog', badge: 'gray', category: 'Anysphere' },
      { id: 'cursor-landing', title: 'cursor.com landing refresh', badge: 'blue', category: 'Anysphere' },
      { id: 'chat-reactions', title: 'Chat message reactions', badge: 'blue', category: 'Anysphere' },
      { id: 'anysphere-more', title: 'More', isMore: true, category: 'Anysphere' },
    ],
  },
  {
    title: 'Everysphere',
    items: [
      { id: 'unified-search', title: 'Unified search index', badge: 'blue', category: 'Everysphere' },
      { id: 'settings-ui', title: 'Settings & Config UI', badge: 'blue', category: 'Everysphere' },
      { id: 'shared-diff', title: 'Shared diff review flows', badge: 'gray', category: 'Everysphere' },
      { id: 'tab-autocomplete', title: 'Tab Autocomplete Rewrite', badge: 'gray', category: 'Everysphere' },
    ],
  },
];

export const DIFF_FILES_COMPOSER_GHOST: DiffFile[] = [
  {
    id: 'tab-bar',
    path: 'src/components/PaneContainer/PaneTabBar.tsx',
    additions: 5,
    deletions: 4,
    status: 'modified',
    staged: false,
    extraContextTop: [
      { oldLineNumber: 6, newLineNumber: 6, type: 'context', content: 'interface TabBarProps {' },
      { oldLineNumber: 7, newLineNumber: 7, type: 'context', content: '  isCompact?: boolean;' },
      { oldLineNumber: 8, newLineNumber: 8, type: 'context', content: '  isPinned?: boolean;' },
    ],
    lines: [
      { id: 'l9', oldLineNumber: 9, newLineNumber: 9, type: 'context', content: '  return useMemo(() => {' },
      { id: 'l10', oldLineNumber: 10, newLineNumber: 10, type: 'context', content: '    if (!isPinned) {' },
      { id: 'l11', oldLineNumber: 11, newLineNumber: 11, type: 'context', content: '      return { iconSize: isCompact ? 12 : 14, buttonSizeClass: "" };' },
      { id: 'l12', oldLineNumber: 12, newLineNumber: 12, type: 'context', content: '    }' },
      {
        id: 'l13-del',
        oldLineNumber: 13,
        newLineNumber: '',
        type: 'delete',
        content: '    const pinnedIconSize = isCompact ? 14 : 16;',
        highlightTokens: [{ text: 'pinnedIconSize', type: 'del' }],
      },
      {
        id: 'l14-del',
        oldLineNumber: 14,
        newLineNumber: '',
        type: 'delete',
        content: '    const pinnedButtonSizeClass = isCompact ? "h-5 w-5" : "h-6 w-6";',
        highlightTokens: [{ text: 'pinnedButtonSizeClass', type: 'del' }, { text: '"h-5 w-5" : "h-6 w-6"', type: 'del' }],
      },
      {
        id: 'l15-del',
        oldLineNumber: 15,
        newLineNumber: '',
        type: 'delete',
        content: '    return { iconSize: pinnedIconSize, buttonSizeClass: pinnedButtonSizeClass };',
        highlightTokens: [{ text: 'pinnedIconSize', type: 'del' }, { text: 'pinnedButtonSizeClass', type: 'del' }],
      },
      {
        id: 'l13-add',
        oldLineNumber: '',
        newLineNumber: 13,
        type: 'add',
        content: '    const iconSize = isCompact ? 14 : 16;',
        highlightTokens: [{ text: 'iconSize', type: 'add' }],
      },
      {
        id: 'l14-add',
        oldLineNumber: '',
        newLineNumber: 14,
        type: 'add',
        content: '    const buttonSizeClass = isCompact ? "w-6 h-6" : "w-7 h-7";',
        highlightTokens: [{ text: 'buttonSizeClass', type: 'add' }, { text: '"w-6 h-6"', type: 'add' }, { text: '"w-7 h-7"', type: 'add' }],
      },
      {
        id: 'l15-add',
        oldLineNumber: '',
        newLineNumber: 15,
        type: 'add',
        content: '    return { iconSize, buttonSizeClass };',
        highlightTokens: [{ text: 'iconSize', type: 'add' }, { text: 'buttonSizeClass', type: 'add' }],
      },
      { id: 'l16', oldLineNumber: 16, newLineNumber: 16, type: 'context', content: '  }, [isPinned, isCompact]);' },
      { id: 'l17', oldLineNumber: 17, newLineNumber: 17, type: 'context', content: '}' },
      { id: 'l18', oldLineNumber: 18, newLineNumber: 18, type: 'context', content: '' },
      { id: 'l19', oldLineNumber: 19, newLineNumber: 19, type: 'context', content: 'export function PinnedTabItem({ tab, isActive, isCompact, onTabClick }: {' },
      { id: 'l20', oldLineNumber: 20, newLineNumber: 20, type: 'context', content: '  const onLeave = useCallback(() => setHovered(false), []);' },
      { id: 'l-sep', oldLineNumber: '...', newLineNumber: '...', type: 'context', content: '' },
      { id: 'l31', oldLineNumber: 31, newLineNumber: 31, type: 'context', content: '  return (' },
      { id: 'l32', oldLineNumber: 32, newLineNumber: 32, type: 'context', content: '    <div' },
      {
        id: 'l33-del',
        oldLineNumber: 33,
        newLineNumber: '',
        type: 'delete',
        content: '      className="flex items-center self-stretch"',
      },
      {
        id: 'l33-add',
        oldLineNumber: '',
        newLineNumber: 33,
        type: 'add',
        content: '      className="flex items-center justify-center self-stretch px-0.5"',
        highlightTokens: [{ text: 'justify-center', type: 'add' }, { text: 'px-0.5', type: 'add' }],
      },
      { id: 'l34', oldLineNumber: 34, newLineNumber: 34, type: 'context', content: '      title={shortcut || undefined}' },
      { id: 'l35', oldLineNumber: 35, newLineNumber: 35, type: 'context', content: '      onMouseEnter={onEnter}' },
      { id: 'l36', oldLineNumber: 36, newLineNumber: 36, type: 'context', content: '      onMouseLeave={onLeave}' },
      { id: 'l37', oldLineNumber: 37, newLineNumber: 37, type: 'context', content: '    >' },
      { id: 'l38', oldLineNumber: 38, newLineNumber: 38, type: 'context', content: '      <button' },
      { id: 'l52', oldLineNumber: 52, newLineNumber: 52, type: 'context', content: '' },
    ],
  },
  {
    id: 'resize-observer',
    path: 'src/hooks/useResizeObserver.ts',
    additions: 25,
    deletions: 0,
    status: 'added',
    staged: false,
    lines: [
      { id: 'ro1', oldLineNumber: '', newLineNumber: 1, type: 'add', content: 'import { useEffect, useRef, useCallback } from "react";' },
      { id: 'ro2', oldLineNumber: '', newLineNumber: 2, type: 'context', content: '' },
      { id: 'ro3', oldLineNumber: '', newLineNumber: 3, type: 'add', content: 'type ResizeCallback = (entry: ResizeObserverEntry) => void;' },
      { id: 'ro4', oldLineNumber: '', newLineNumber: 4, type: 'context', content: '' },
      { id: 'ro5', oldLineNumber: '', newLineNumber: 5, type: 'add', content: 'export function useResizeObserver(' },
      { id: 'ro6', oldLineNumber: '', newLineNumber: 6, type: 'add', content: '  ref: React.RefObject<HTMLElement | null>,' },
      { id: 'ro7', oldLineNumber: '', newLineNumber: 7, type: 'add', content: '  callback: ResizeCallback,' },
      { id: 'ro8', oldLineNumber: '', newLineNumber: 8, type: 'add', content: ') {' },
      { id: 'ro9', oldLineNumber: '', newLineNumber: 9, type: 'add', content: '  const callbackRef = useRef(callback);' },
      { id: 'ro10', oldLineNumber: '', newLineNumber: 10, type: 'add', content: '  callbackRef.current = callback;' },
      { id: 'ro11', oldLineNumber: '', newLineNumber: 11, type: 'context', content: '' },
    ],
  },
];

export const PROJECT_FILES: ProjectFile[] = [
  {
    id: 'f-tab-bar',
    path: 'src/components/PaneContainer/PaneTabBar.tsx',
    name: 'PaneTabBar.tsx',
    language: 'typescript',
    isModified: true,
    content: `import React, { useMemo, useCallback, useState } from "react";

interface TabBarProps {
  isCompact?: boolean;
  isPinned?: boolean;
}

export function useTabDimensions({ isPinned, isCompact }: TabBarProps) {
  return useMemo(() => {
    if (!isPinned) {
      return { iconSize: isCompact ? 12 : 14, buttonSizeClass: "" };
    }
    const iconSize = isCompact ? 14 : 16;
    const buttonSizeClass = isCompact ? "w-6 h-6" : "w-7 h-7";
    return { iconSize, buttonSizeClass };
  }, [isPinned, isCompact]);
}

export function PinnedTabItem({ tab, isActive, isCompact, onTabClick }: any) {
  const [hovered, setHovered] = useState(false);
  const onLeave = useCallback(() => setHovered(false), []);
  const onEnter = useCallback(() => setHovered(true), []);

  return (
    <div
      className="flex items-center justify-center self-stretch px-0.5"
      title={tab.shortcut || undefined}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <button
        onClick={() => onTabClick(tab.id)}
        className="flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors"
      >
        <span>{tab.title}</span>
      </button>
    </div>
  );
}`,
  },
  {
    id: 'f-resize-obs',
    path: 'src/hooks/useResizeObserver.ts',
    name: 'useResizeObserver.ts',
    language: 'typescript',
    isModified: true,
    content: `import { useEffect, useRef, useCallback } from "react";

type ResizeCallback = (entry: ResizeObserverEntry) => void;

export function useResizeObserver(
  ref: React.RefObject<HTMLElement | null>,
  callback: ResizeCallback,
) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        callbackRef.current(entries[0]);
      }
    });

    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);
}`,
  },
  {
    id: 'f-debounce',
    path: 'src/lib/debounceCompletion.ts',
    name: 'debounceCompletion.ts',
    language: 'typescript',
    isModified: false,
    content: `/**
 * High-performance leading/trailing debounce for ghost-text completion pipeline.
 * Cancels pending inference calls whenever a new keystroke is registered.
 */
export function debounceCompletion<T extends (...args: any[]) => void>(
  fn: T,
  waitMs: number = 35
) {
  let timer: NodeJS.Timeout | null = null;
  let abortController: AbortController | null = null;

  return (...args: Parameters<T>) => {
    if (abortController) {
      abortController.abort();
    }
    abortController = new AbortController();

    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      fn(...args);
    }, waitMs);
  };
}`,
  },
  {
    id: 'f-package',
    path: 'package.json',
    name: 'package.json',
    language: 'json',
    isModified: false,
    content: `{
  "name": "cursor-composer-app",
  "version": "0.42.0-nightly",
  "private": true,
  "dependencies": {
    "react": "^19.0.1",
    "react-dom": "^19.0.1",
    "motion": "^12.23.24",
    "lucide-react": "^0.546.0"
  }
}`,
  },
];

export const SESSIONS_MAP: Record<string, SessionData> = {
  'composer-ghost': {
    id: 'composer-ghost',
    title: 'Composer ghost',
    prompt:
      'Rewrite the ghost-text pipeline to reduce suggestion latency, add multi-line preview, and handle cancellation when the user keeps typing',
    steps: [
      {
        id: 's-1',
        type: 'search',
        query: 'ghost text render path',
        status: 'completed',
        durationMs: 14,
        details: 'Queried AST symbols for ghost text virtual overlay and token spans.',
        checkpointId: 'cp-init',
        snapshotStats: { additions: 0, deletions: 0 },
        matches: [
          { file: 'src/components/PaneContainer/PaneTabBar.tsx', line: 13, preview: 'const pinnedIconSize = isCompact ? 14 : 16;' },
          { file: 'src/components/PaneContainer/PaneTabBar.tsx', line: 33, preview: 'className="flex items-center self-stretch"' },
        ],
      },
      {
        id: 's-2',
        type: 'grep',
        query: 'inline completion + debounce',
        status: 'completed',
        durationMs: 8,
        details: 'Scanned 14 files for debounce timers and active AbortController races.',
        checkpointId: 'cp-grep',
        snapshotStats: { additions: 25, deletions: 0 },
        matches: [
          { file: 'src/hooks/useResizeObserver.ts', line: 1, preview: 'import { useEffect, useRef, useCallback } from "react";' },
          { file: 'src/lib/debounceCompletion.ts', line: 7, preview: 'export function debounceCompletion(...)' },
        ],
      },
    ],
    response:
      "On it. I'll profile the current pipeline, fix the cancellation race, and add multi-line ghost-text rendering with proper stale-completion cleanup.",
    processedItem: 'screen recording',
    videoPreview: true,
    summary:
      'Ghost-text pipeline rewritten: p50 latency down 40%, multi-line preview renders inline, and stale completions are cancelled on keystroke. Behind flag on nightly.',
    diffStats: { additions: 98, deletions: 20, filesCount: 5 },
    files: DIFF_FILES_COMPOSER_GHOST,
    model: 'Composer 2.5 Fast',
  },
  'sidebar-reorderable': {
    id: 'sidebar-reorderable',
    title: 'Sidebar reorderable',
    prompt:
      'Add drag and drop reordering to sidebar navigation items with smooth keyboard accessible reordering and optimistic local state',
    steps: [
      {
        id: 'sr-1',
        type: 'search',
        query: 'Sidebar list items drag reorder',
        status: 'completed',
        durationMs: 11,
        details: 'Located section array loop and active item state handler.',
        matches: [
          { file: 'src/components/Sidebar.tsx', line: 42, preview: 'const handleMove = (id: string, delta: number) => {' },
        ],
      },
      {
        id: 'sr-2',
        type: 'read',
        query: 'src/components/Sidebar.tsx',
        status: 'completed',
        durationMs: 6,
        details: 'Read 240 lines to construct optimistic list swap hook.',
      },
    ],
    response:
      'Added smooth item swap handlers, drag grips, and keyboard shortcuts (⌥↑ and ⌥↓) for reordering sidebar items without layout jitter.',
    summary:
      'Reordering implemented with micro-animations, localStorage persistence, and accessible focus states across all 3 section lists.',
    diffStats: { additions: 44, deletions: 8, filesCount: 2 },
    files: [
      {
        id: 'sidebar-file',
        path: 'src/components/Sidebar.tsx',
        additions: 32,
        deletions: 8,
        status: 'modified',
        lines: [
          { oldLineNumber: 42, newLineNumber: 42, type: 'context', content: '  const handleMove = (id: string, delta: number) => {' },
          { oldLineNumber: 43, newLineNumber: '', type: 'delete', content: '    // static array reorder' },
          { oldLineNumber: '', newLineNumber: 43, type: 'add', content: '    setSections(prev => reorderSectionItem(prev, id, delta));' },
          { oldLineNumber: 44, newLineNumber: 44, type: 'context', content: '  };' },
        ],
      },
    ],
    model: 'Composer 2.5 Fast',
  },
  'agentic-chat': {
    id: 'agentic-chat',
    title: 'Agentic chat',
    prompt:
      'Implement structured tool approval gates for destructive bash commands with diff previews before execution',
    steps: [
      {
        id: 'ac-1',
        type: 'grep',
        query: 'run_command executeToolCall',
        status: 'completed',
        durationMs: 9,
        details: 'Found execution dispatcher without prompt verification barrier.',
      },
      {
        id: 'ac-2',
        type: 'edit',
        query: 'src/agent/ApprovalGate.tsx',
        status: 'completed',
        durationMs: 22,
        details: 'Synthesized modal dialog with sandboxed dry-run execution.',
      },
    ],
    response:
      'Created approval modal interceptor for dangerous operations, with command simulation and roll-back snapshots.',
    summary:
      'Added interactive confirmation banner with safety level classification (Safe, Read-Only, Destructive).',
    diffStats: { additions: 112, deletions: 14, filesCount: 3 },
    files: [
      {
        id: 'gate-file',
        path: 'src/agent/ApprovalGate.tsx',
        additions: 85,
        deletions: 0,
        status: 'added',
        lines: [
          { oldLineNumber: '', newLineNumber: 1, type: 'add', content: 'export interface ToolApprovalRequest {' },
          { oldLineNumber: '', newLineNumber: 2, type: 'add', content: '  tool: string;' },
          { oldLineNumber: '', newLineNumber: 3, type: 'add', content: '  arguments: Record<string, unknown>;' },
          { oldLineNumber: '', newLineNumber: 4, type: 'add', content: '  safetyScore: number;' },
          { oldLineNumber: '', newLineNumber: 5, type: 'add', content: '}' },
        ],
      },
    ],
    model: 'Claude 3.7 Sonnet',
  },
  'cursor-landing': {
    id: 'cursor-landing',
    title: 'cursor.com landing refresh',
    prompt:
      'Refresh hero typography and micro-interactions on features matrix with high DPI SVG illustrations',
    steps: [
      {
        id: 'cl-1',
        type: 'search',
        query: 'HeroSection.tsx layout Tailwind',
        status: 'completed',
        durationMs: 12,
        details: 'Checked header component style classes and responsive breakpoints.',
      },
    ],
    response:
      'Updated typography scale to Inter Display with subtle ambient glow backdrop blur.',
    summary:
      'Hero metrics boosted: p99 LCP down to 0.4s and refreshed badge typography.',
    diffStats: { additions: 67, deletions: 23, filesCount: 4 },
    files: [
      {
        id: 'hero-file',
        path: 'src/pages/LandingHero.tsx',
        additions: 67,
        deletions: 23,
        status: 'modified',
        lines: [
          { oldLineNumber: 15, newLineNumber: 15, type: 'context', content: '  return (' },
          { oldLineNumber: 16, newLineNumber: '', type: 'delete', content: '    <h1 className="text-4xl font-bold tracking-tight">' },
          { oldLineNumber: '', newLineNumber: 16, type: 'add', content: '    <h1 className="text-5xl md:text-6xl font-semibold tracking-[-0.03em]">' },
          { oldLineNumber: 17, newLineNumber: 17, type: 'context', content: '      The AI-first Code Editor' },
        ],
      },
    ],
    model: 'Composer 2.5 Fast',
  },
};

export const INITIAL_BENCHMARK_DATA = {
  p50Latency: '42ms',
  latencyReduction: '-40%',
  previewFps: '60 fps',
  keystrokeAbortCount: 142,
  cacheHitRatio: '94.2%',
  memoryFootprint: '18.4 MB',
};

