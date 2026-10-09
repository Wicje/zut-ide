import React, { useState, useEffect } from 'react';
import {
  Search,
  Terminal,
  Activity,
  Moon,
  Sun,
  GitPullRequest,
  GitCommit,
  Split,
  Sparkles,
  FileCode,
  Layers,
  ArrowRight,
  History,
  Link2,
  Globe,
} from 'lucide-react';

interface CommandPaletteItem {
  id: string;
  title: string;
  shortcut?: string;
  category: string;
  icon: React.ReactNode;
  action: () => void;
}

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSession: (id: string) => void;
  onToggleTheme: () => void;
  onToggleDiffMode: () => void;
  onToggleTerminal: () => void;
  onCreatePR: () => void;
  onCommitPush: () => void;
  onNewAgent: () => void;
  onOpenDeploy?: () => void;
  onOpenAccount?: () => void;
  onOpenHistory?: () => void;
  onShare?: () => void;
  onImportUrl?: () => void;
  onPushGithub?: () => void;
  theme?: 'light' | 'dark';
  sessions?: Array<{ id: string; title: string }>;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  onSelectSession,
  onToggleTheme,
  onToggleDiffMode,
  onToggleTerminal,
  onCreatePR,
  onCommitPush,
  onNewAgent,
  onOpenDeploy,
  onOpenAccount,
  onOpenHistory,
  onShare,
  onImportUrl,
  onPushGithub,
  theme = 'light',
  sessions,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const isDark = theme === 'dark';

  const items: CommandPaletteItem[] = [
    {
      id: 'theme',
      title: isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme',
      shortcut: '⌘T',
      category: 'Preferences',
      icon: isDark ? <Sun size={14} className="text-amber-500" /> : <Moon size={14} className="text-purple-500" />,
      action: () => {
        onToggleTheme();
        onClose();
      },
    },
    {
      id: 'deploy-vercel',
      title: 'Deploy Preview to Vercel (Production Edge)',
      shortcut: '⌘V',
      category: 'Deployment',
      icon: <Terminal size={14} className="text-blue-500" />,
      action: () => {
        if (onOpenDeploy) onOpenDeploy();
        onClose();
      },
    },
    {
      id: 'account-settings',
      title: 'Account Settings & Usage',
      category: 'Preferences',
      icon: <Layers size={14} className="text-purple-500" />,
      action: () => {
        if (onOpenAccount) onOpenAccount();
        onClose();
      },
    },
    {
      id: 'history',
      title: 'Version History (snapshots)',
      category: 'Project',
      icon: <History size={14} className="text-purple-500" />,
      action: () => {
        if (onOpenHistory) onOpenHistory();
        onClose();
      },
    },
    {
      id: 'share-link',
      title: 'Share read-only link',
      category: 'Project',
      icon: <Link2 size={14} className="text-blue-500" />,
      action: () => {
        if (onShare) onShare();
        onClose();
      },
    },
    {
      id: 'import-url',
      title: 'Import from URL',
      category: 'Project',
      icon: <Globe size={14} className="text-emerald-500" />,
      action: () => {
        if (onImportUrl) onImportUrl();
        onClose();
      },
    },
    {
      id: 'push-github',
      title: 'Push to GitHub',
      category: 'Source Control',
      icon: <GitPullRequest size={14} className="text-neutral-500" />,
      action: () => {
        if (onPushGithub) onPushGithub();
        onClose();
      },
    },
    {
      id: 'diff-mode',
      title: 'Toggle Split / Unified Diff View',
      shortcut: '⌘D',
      category: 'Editor',
      icon: <Split size={14} className="text-blue-500" />,
      action: () => {
        onToggleDiffMode();
        onClose();
      },
    },
    {
      id: 'new-agent',
      title: 'New Agent Session',
      shortcut: '⌘N',
      category: 'Agent',
      icon: <Sparkles size={14} className="text-indigo-500" />,
      action: () => {
        onNewAgent();
        onClose();
      },
    },
    {
      id: 'benchmarks',
      title: 'Toggle Benchmarks & Terminal Drawer',
      shortcut: '⌘J',
      category: 'View',
      icon: <Activity size={14} className="text-emerald-500" />,
      action: () => {
        onToggleTerminal();
        onClose();
      },
    },
    {
      id: 'create-pr',
      title: 'Git: Create Pull Request',
      shortcut: '⌘P',
      category: 'Source Control',
      icon: <GitPullRequest size={14} className="text-emerald-600" />,
      action: () => {
        onCreatePR();
        onClose();
      },
    },
    {
      id: 'commit-push',
      title: 'Git: Commit & Push Changes',
      shortcut: '⌘S',
      category: 'Source Control',
      icon: <GitCommit size={14} className="text-blue-600" />,
      action: () => {
        onCommitPush();
        onClose();
      },
    },
    ...(sessions ?? []).map((s) => ({
      id: `session-${s.id}`,
      title: `Jump to Session: ${s.title}`,
      category: 'Sessions',
      icon: <Layers size={14} className="text-neutral-500" />,
      action: () => {
        onSelectSession(s.id);
        onClose();
      },
    })),
  ];

  const filteredItems = items.filter(
    (item) =>
      item.title.toLowerCase().includes(query.toLowerCase()) ||
      item.category.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % (filteredItems.length || 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % (filteredItems.length || 1));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredItems[selectedIndex]) {
          filteredItems[selectedIndex].action();
        }
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, filteredItems]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/50 backdrop-blur-xs p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-xl rounded-xl shadow-2xl overflow-hidden border ${
          isDark ? 'bg-[#1e1e24] border-neutral-700 text-neutral-200' : 'bg-white border-neutral-200 text-neutral-800'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className={`flex items-center gap-3 px-3.5 py-3 border-b ${
          isDark ? 'border-neutral-800 bg-[#25252b]' : 'border-neutral-200 bg-neutral-50/50'
        }`}>
          <Search size={16} className="text-neutral-400 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search sessions..."
            className="flex-1 bg-transparent text-sm focus:outline-none placeholder-neutral-400"
            autoFocus
          />
          <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-200/50 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-300">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-72 overflow-y-auto p-1.5 space-y-0.5">
          {filteredItems.length === 0 ? (
            <div className="py-8 text-center text-xs text-neutral-400">
              No matching commands found
            </div>
          ) : (
            filteredItems.map((item, index) => {
              const isSelected = index === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs cursor-pointer transition-colors ${
                    isSelected
                      ? isDark
                        ? 'bg-blue-600/30 text-white'
                        : 'bg-neutral-100 text-neutral-900 font-medium'
                      : isDark
                      ? 'text-neutral-300 hover:bg-neutral-800'
                      : 'text-neutral-700 hover:bg-neutral-50'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="shrink-0">{item.icon}</span>
                    <span className="truncate">{item.title}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded ${
                      isDark ? 'bg-neutral-800 text-neutral-400' : 'bg-neutral-200/70 text-neutral-500'
                    }`}>
                      {item.category}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {item.shortcut && (
                      <kbd className="font-mono text-[10px] text-neutral-400">
                        {item.shortcut}
                      </kbd>
                    )}
                    {isSelected && <ArrowRight size={12} className="text-blue-500" />}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
