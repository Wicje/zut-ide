import React, { useState, useEffect, useRef } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import {
  Upload,
  FileCode,
  Folder,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  X,
  Play,
  Copy,
  Check,
  Split,
  Maximize2,
  FileText,
  Save,
  Zap,
  Sparkles,
  Command,
  RotateCcw,
  CornerDownLeft,
} from 'lucide-react';
import { ProjectFile } from '../types';

interface CodeEditorPaneProps {
  files: ProjectFile[];
  activeFileId: string;
  onSelectFile: (fileId: string) => void;
  onCloseFile?: (fileId: string) => void;
  onSwitchToDiff: () => void;
  /** Real edit channel: (fileId, full new content). */
  onEditFile?: (fileId: string, content: string) => void;
  /** Real inline-prompt channel: (prompt, fileId) -> agent turn. */
  onInlinePrompt?: (prompt: string, fileId: string) => void;
  /** Real upload channel: files picked from this device. */
  onUploadFiles?: (files: FileList | File[]) => void;
  /** Save location + last build time for the status bar. */
  saveState?: string | null;
  buildMs?: number | null;
  theme?: 'light' | 'dark';
}

export const CodeEditorPane: React.FC<CodeEditorPaneProps> = ({
  files,
  activeFileId,
  onEditFile,
  onInlinePrompt,
  onUploadFiles,
  saveState,
  buildMs,
  onSelectFile,
  onCloseFile,
  onSwitchToDiff,
  theme = 'light',
}) => {
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const isDark = theme === 'dark';
  const [openTabs, setOpenTabs] = useState<string[]>(() =>
    files.length > 0 ? [files[0].id] : [],
  );
  useEffect(() => {
    if (files.length > 0 && !openTabs.some((id) => files.some((f) => f.id === id))) {
      setOpenTabs([files[0].id]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);
  const [isFileTreeOpen, setIsFileTreeOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });

  // In-Editor Inline ⌘K Prompt State (wired to the real agent)
  const [inlineKOpen, setInlineKOpen] = useState(false);
  const [inlineKPrompt, setInlineKPrompt] = useState('');

  const activeFile = files.find((f) => f.id === activeFileId) || files[0];
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  if (!activeFile) {
    return (
      <div className="flex-1 grid place-content-center text-xs text-neutral-400 select-none">
        No files in this project yet — ask the agent to create one.
      </div>
    );
  }

  // Keyboard shortcut listener inside editor (⌘K toggles the inline prompt)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setInlineKOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor;
    editor.onDidChangeCursorPosition((e) => {
      setCursor({ line: e.position.lineNumber, col: e.position.column });
    });
  };

  const handleTabClick = (fileId: string) => {
    if (!openTabs.includes(fileId)) {
      setOpenTabs((prev) => [...prev, fileId]);
    }
    onSelectFile(fileId);
  };

  const handleCloseTab = (e: React.MouseEvent, fileId: string) => {
    e.stopPropagation();
    const newTabs = openTabs.filter((id) => id !== fileId);
    setOpenTabs(newTabs);
    if (activeFileId === fileId && newTabs.length > 0) {
      onSelectFile(newTabs[newTabs.length - 1]);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard?.writeText(activeFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Submit in-editor ⌘K prompt to the real agent (scoped to this file)
  const handleInlineKSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inlineKPrompt.trim() || !activeFile) return;
    onInlinePrompt?.(inlineKPrompt.trim(), activeFile.id);
    setInlineKOpen(false);
    setInlineKPrompt('');
  };

  return (
    <div
      className={`flex-1 flex flex-col justify-between overflow-hidden select-none text-[13px] transition-colors ${
        isDark ? 'bg-[#1e1e24] text-neutral-200' : 'bg-white text-neutral-800'
      }`}
    >
      {/* Top Header Bar */}
      <div
        className={`h-10 px-3.5 border-b flex items-center justify-between ${
          isDark ? 'border-neutral-800 bg-[#18181b]' : 'border-[#e5e5e7] bg-white'
        }`}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={onSwitchToDiff}
            className={`px-2.5 py-1 text-xs rounded-md font-medium border transition-colors flex items-center gap-1.5 cursor-pointer ${
              isDark
                ? 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:text-white'
                : 'bg-neutral-100 border-neutral-300 text-neutral-700 hover:text-neutral-900'
            }`}
          >
            <Split size={13} />
            <span>Switch to SCM Diff View</span>
          </button>

          <div className="h-3.5 w-px bg-neutral-200 dark:bg-neutral-800" />

          <button
            onClick={() => setIsFileTreeOpen(!isFileTreeOpen)}
            className={`text-xs px-2 py-0.5 rounded transition-colors cursor-pointer ${
              isFileTreeOpen
                ? isDark
                  ? 'text-blue-400 bg-blue-500/10'
                  : 'text-blue-600 bg-blue-50'
                : 'text-neutral-400 hover:text-neutral-700'
            }`}
          >
            Explorer
          </button>
        </div>

        {/* Live Ghost Autocomplete Status & Trigger ⌘K */}
        <div className="flex items-center gap-2">
          {/* Trigger ⌘K in editor */}
          <button
            onClick={() => setInlineKOpen(!inlineKOpen)}
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium border transition-colors cursor-pointer ${
              inlineKOpen
                ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                : isDark
                ? 'bg-neutral-800 border-neutral-700 text-neutral-300 hover:text-white'
                : 'bg-neutral-50 border-neutral-300 text-neutral-700 hover:text-neutral-900'
            }`}
            title="Open Inline Composer (⌘K)"
          >
            <Sparkles size={11} className={inlineKOpen ? 'text-white' : 'text-purple-500'} />
            <span>Inline ⌘K</span>
          </button>

          <div className="flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <Zap size={11} />
            <span>{activeFile.language}</span>
          </div>

          <button
            onClick={handleCopyCode}
            className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 p-1 transition-colors cursor-pointer"
            title={copied ? 'Copied code!' : 'Copy full file code'}
          >
            {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
          </button>
        </div>
      </div>

      {/* Main Body: File Tree + Tabs + Breadcrumbs + Editor + Minimap */}
      <div className="flex-1 flex overflow-hidden">
        {/* File Tree Explorer */}
        {isFileTreeOpen && (
          <div
            className={`w-52 shrink-0 border-r flex flex-col justify-between overflow-y-auto text-xs ${
              isDark ? 'bg-[#161619] border-neutral-800' : 'bg-[#fbfbfd] border-[#e5e5e7]'
            }`}
          >
            <div className="p-2 space-y-1">
              <div className="px-1.5 py-1 text-[10.5px] font-semibold text-neutral-400 uppercase tracking-wider flex items-center gap-1">
                <ChevronDown size={12} />
                <span className="flex-1">workspace / src</span>
                {onUploadFiles && (
                  <>
                    <input
                      ref={uploadRef}
                      type="file"
                      multiple
                      accept=".html,.htm,.css,.js,.jsx,.ts,.tsx,.mjs,.json,.txt,.md,.svg,.png,.jpg,.jpeg,.gif,.webp,.ico"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        if (e.target.files) onUploadFiles(e.target.files);
                        e.target.value = '';
                      }}
                    />
                    <button
                      onClick={() => uploadRef.current?.click()}
                      className="rounded p-0.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                      title="Upload files from this device"
                    >
                      <Upload size={12} />
                    </button>
                  </>
                )}
              </div>

              <div className="space-y-0.5 pl-1.5">
                {files.map((file) => {
                  const isSelected = activeFileId === file.id;
                  return (
                    <button
                      key={file.id}
                      onClick={() => handleTabClick(file.id)}
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-[12px] transition-colors text-left cursor-pointer ${
                        isSelected
                          ? isDark
                            ? 'bg-blue-600/25 text-white font-medium'
                            : 'bg-neutral-200/80 text-neutral-900 font-medium'
                          : isDark
                          ? 'text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200'
                          : 'text-neutral-600 hover:bg-black/5 hover:text-neutral-900'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <FileCode size={13} className={file.name.endsWith('.tsx') ? 'text-blue-500' : 'text-amber-500'} />
                        <span className="truncate">{file.name}</span>
                      </div>
                      {file.isModified && (
                        <span className="text-[10px] text-amber-500 font-bold ml-1">
                          M
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={`p-2 border-t text-[11px] text-neutral-400 ${
              isDark ? 'border-neutral-800' : 'border-[#e5e5e7]'
            }`}>
              <span>{files.length} source file{files.length === 1 ? '' : 's'} loaded</span>
            </div>
          </div>
        )}

        {/* Editor Area with Tab Bar, Breadcrumbs, and Minimap */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tab Bar */}
          <div
            className={`h-8 border-b flex items-center overflow-x-auto ${
              isDark ? 'bg-[#18181c] border-neutral-800' : 'bg-[#f4f4f6] border-[#e5e5e7]'
            }`}
          >
            {openTabs.map((tabId) => {
              const file = files.find((f) => f.id === tabId);
              if (!file) return null;
              const isActive = activeFileId === tabId;

              return (
                <div
                  key={tabId}
                  onClick={() => onSelectFile(tabId)}
                  className={`h-full px-3 flex items-center gap-2 border-r text-[12px] cursor-pointer transition-colors ${
                    isActive
                      ? isDark
                        ? 'bg-[#1e1e24] text-white border-b-2 border-b-blue-500 border-r-neutral-800 font-medium'
                        : 'bg-white text-neutral-900 border-b-2 border-b-blue-600 border-r-[#e5e5e7] font-medium'
                      : isDark
                      ? 'text-neutral-400 hover:bg-neutral-800/40 border-r-neutral-800'
                      : 'text-neutral-600 hover:bg-neutral-100 border-r-[#e5e5e7]'
                  }`}
                >
                  <FileCode size={12} className="text-blue-500" />
                  <span>{file.name}</span>
                  {file.isModified && (
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  )}
                  <button
                    onClick={(e) => handleCloseTab(e, tabId)}
                    className="text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 p-0.5 rounded"
                  >
                    <X size={11} />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Hierarchical Breadcrumbs Bar */}
          <div
            className={`h-6 px-3 border-b flex items-center gap-1.5 text-[11px] font-mono select-none ${
              isDark ? 'bg-[#18181c] border-neutral-800/60 text-neutral-400' : 'bg-[#fafafc] border-[#e5e5e7]/60 text-neutral-500'
            }`}
          >
            {activeFile.path.split('/').map((seg, i, arr) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <span>›</span>}
                <span className={i === arr.length - 1 ? 'font-semibold text-neutral-700 dark:text-neutral-200' : 'hover:text-blue-500 cursor-pointer'}>
                  {seg}
                </span>
              </span>
            ))}
          </div>

          {/* Editor Canvas (Monaco) + Floating Inline Prompt */}
          <div className="flex-1 flex overflow-hidden relative">
            <div className="flex-1 min-w-0">
              {activeFile ? (
                <Editor
                  path={activeFile.path}
                  defaultLanguage={activeFile.language}
                  value={activeFile.content}
                  theme={isDark ? 'vs-dark' : 'vs'}
                  onChange={(v) => onEditFile?.(activeFile.id, v ?? '')}
                  onMount={handleMount}
                  options={{
                    fontSize: 12,
                    lineHeight: 20,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                    minimap: { enabled: true },
                    wordWrap: 'on',
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    tabSize: 2,
                    padding: { top: 8 },
                    scrollbar: { verticalScrollbarSize: 9 },
                    smoothScrolling: true,
                  }}
                />
              ) : (
                <div className="grid h-full place-content-center text-xs text-neutral-400">
                  No file open.
                </div>
              )}
            </div>

            {/* In-Editor Inline Prompt Bar (asks the real agent about this file) */}
            {inlineKOpen && activeFile && (
              <div className="absolute left-8 right-8 top-3 p-3 rounded-xl border border-purple-500/40 bg-white/95 dark:bg-[#1e1e24]/95 shadow-xl backdrop-blur-md animate-fadeIn z-20">
                <div className="flex items-center justify-between text-xs font-sans pb-1.5">
                  <div className="flex items-center gap-1.5 font-semibold text-purple-700 dark:text-purple-300">
                    <Sparkles size={13} />
                    <span>Ask agent about {activeFile.name} (⌘K)</span>
                  </div>
                  <button
                    onClick={() => setInlineKOpen(false)}
                    className="text-neutral-400 hover:text-neutral-700 dark:hover:text-white"
                  >
                    <X size={12} />
                  </button>
                </div>
                <form onSubmit={handleInlineKSubmit} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={inlineKPrompt}
                    onChange={(e) => setInlineKPrompt(e.target.value)}
                    placeholder="e.g. Memoize icon size calculation with useMemo"
                    className={`flex-1 px-3 py-1.5 text-xs font-sans rounded-lg border focus:outline-none focus:ring-1 focus:ring-purple-500 ${
                      isDark
                        ? 'bg-[#1e1e24] border-neutral-700 text-white'
                        : 'bg-white border-neutral-300 text-neutral-900'
                    }`}
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-sans text-xs font-semibold flex items-center gap-1 shadow-xs cursor-pointer"
                  >
                    <span>Ask agent</span>
                    <CornerDownLeft size={11} />
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Status Bar */}
          <div
            className={`h-6 px-3 border-t flex items-center justify-between text-[11px] select-none ${
              isDark ? 'bg-[#161619] border-neutral-800 text-neutral-400' : 'bg-[#fbfbfd] border-[#e5e5e7] text-neutral-500'
            }`}
          >
            <div className="flex items-center gap-3">
              <span>{activeFile.path}</span>
              <span>UTF-8</span>
              {saveState && <span title="Where this project is saved">· {saveState}</span>}
            </div>
            <div className="flex items-center gap-3">
              {buildMs != null && <span title="Last preview build time">{buildMs}ms</span>}
              <span>{activeFile ? activeFile.language : '—'}</span>
              <span>Spaces: 2</span>
              <span>Ln {cursor.line}, Col {cursor.col}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
