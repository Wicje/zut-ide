import React, { useState, useMemo } from 'react';
import {
  Search,
  PanelLeftClose,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  User,
  Loader2,
  CheckCircle2,
  FolderOpen,
  Folder,
  X,
} from 'lucide-react';
import { SidebarSection, SidebarItem, SidebarTask } from '../types';
import { timeAgo } from '../lib/appModel';
import { buildPathTree, filterTree, flattenTree, countFiles } from '../lib/pathTree';
import type { RecentProject } from '../lib/recent-projects';

interface SidebarProps {
  sections: SidebarSection[];
  onReorderItem?: (sectionTitle: string, itemId: string, direction: 'up' | 'down') => void;
  activeItem: string;
  onSelectItem: (id: string) => void;
  onNewAgent?: () => void;
  onOpenFolder?: () => void;
  onCloneRepo?: () => void;
  onOpenHost?: () => void;
  onOpenGit?: () => void;
  hostConnected?: boolean;
  workspaceLabel?: string | null;
  onOpenCommandPalette?: () => void;
  onOpenAccount?: () => void;
  /** Task list: in progress, then ready for review. */
  tasks?: SidebarTask[];
  onOpenRules?: () => void;
  onToggleSidebar?: () => void;
  user?: { name: string; email: string } | null;
  theme?: 'light' | 'dark';
  /** Device projects stashed by "new project" / switching — one click back. */
  recents?: RecentProject[];
  onOpenRecent?: (id: string) => void;
  onRemoveRecent?: (id: string) => void;
}

interface ProjectTreeProps {
  items: SidebarItem[];
  activeItem: string;
  onSelectItem: (id: string) => void;
  searchFilter: string;
  isDark: boolean;
}

/** Collapsible folder tree for the Project list: folders collapse on click,
 *  dirty files sort first, rows are capped (filter narrows the rest). */
const ProjectTree: React.FC<ProjectTreeProps> = ({
  items,
  activeItem,
  onSelectItem,
  searchFilter,
  isDark,
}) => {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const tree = useMemo(() => {
    const dirtyOf = (path: string) => items.find((i) => i.title === path)?.dirty ?? false;
    const built = buildPathTree(items.map((i) => i.title), dirtyOf);
    return filterTree(built, searchFilter);
  }, [items, searchFilter]);
  const total = countFiles(tree);
  const { rows, hidden } = flattenTree(tree, collapsed, 300);
  const toggle = (path: string) =>
    setCollapsed((prev) => ({ ...prev, [path]: !prev[path] }));

  if (searchFilter && total === 0) {
    return (
      <div className="px-2.5 py-1.5 text-[11px] text-neutral-400">
        No files match “{searchFilter}”.
      </div>
    );
  }
  if (total === 0) {
    return (
      <div className="px-2.5 py-1.5 text-[11px] leading-[1.45] text-neutral-400">
        No files yet — start a new project or open a folder.
      </div>
    );
  }
  return (
    <div className="space-y-0.5">
      <div className="px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.08em] text-neutral-400 uppercase flex items-center gap-2">
        <span>Project</span>
        <span className="font-mono normal-case tracking-normal">{total}</span>
      </div>
      {rows.map(({ node, depth }) =>
        node.kind === 'folder' ? (
          <button
            key={node.path}
            onClick={() => toggle(node.path)}
            aria-expanded={!collapsed[node.path]}
            className={`w-full flex items-center gap-1.5 py-1 rounded-md text-[12px] transition-colors cursor-pointer ${
              isDark ? 'text-neutral-400 hover:bg-white/5' : 'text-neutral-500 hover:bg-black/5'
            }`}
            style={{ paddingLeft: 10 + depth * 12 }}
          >
            {collapsed[node.path] ? (
              <ChevronRight size={11} className="shrink-0" />
            ) : (
              <ChevronDown size={11} className="shrink-0" />
            )}
            <Folder size={11} className="shrink-0" />
            <span className="truncate">{node.name}</span>
            <span className="text-[10px] text-neutral-500 ml-auto pr-1">{countFiles(node.children)}</span>
          </button>
        ) : (
          <button
            key={node.path}
            onClick={() => onSelectItem(`file:${node.path}`)}
            title={node.path}
            className={`w-full flex items-center gap-1.5 py-1 rounded-md text-[12px] transition-colors cursor-pointer ${
              activeItem === `file:${node.path}`
                ? isDark
                  ? 'bg-white/8 text-white'
                  : 'bg-[#e7e7eb] text-neutral-900'
                : isDark
                  ? 'text-neutral-300 hover:bg-white/5'
                  : 'text-neutral-600 hover:bg-black/5'
            }`}
            style={{ paddingLeft: 10 + depth * 12 + 16 }}
          >
            {node.dirty && <span className="w-1.5 h-1.5 shrink-0 rounded-full bg-amber-500" aria-label="Modified" />}
            <span className="truncate">{node.name}</span>
          </button>
        ),
      )}
      {hidden > 0 && (
        <div className="px-2.5 py-1.5 text-[11px] text-neutral-400">
          +{hidden} more — type to filter
        </div>
      )}
    </div>
  );
};

export const Sidebar: React.FC<SidebarProps> = ({
  sections,
  onReorderItem,
  activeItem,
  onSelectItem,
  onNewAgent,
  onOpenFolder,
  onCloneRepo,
  onOpenHost,
  onOpenGit,
  hostConnected,
  workspaceLabel,
  onOpenCommandPalette,
  onOpenAccount,
  tasks,
  onOpenRules,
  onToggleSidebar,
  user,
  theme = 'light',
  recents,
  onOpenRecent,
  onRemoveRecent,
}) => {
  const isDark = theme === 'dark';
  const displayName = user?.name
    ? user.name
    : user?.email
    ? user.email.split('@')[0]
    : 'Guest';
  const displaySub = user?.email ?? 'Not signed in';
  const initials = (user?.name ?? user?.email ?? 'G')
    .split(/\s+/)
    .map((s) => s[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const [searchFilter, setSearchFilter] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);

  return (
    <div
      className={`w-full shrink-0 border-r flex flex-col justify-between h-full select-none text-[13px] transition-colors ${
        'bg-[var(--zut-canvas)] text-[var(--zut-text)] border-[var(--zut-border)]'
      }`}
    >
      {/* Top area */}
      <div className="flex flex-col flex-1 min-h-0">
        {/* Window controls bar */}
        <div className="h-10 px-3.5 flex items-center justify-end">

          {/* Quick search & toggle */}
          <div className="flex items-center gap-2 text-neutral-400">
            <button
              onClick={() => setIsSearchActive(!isSearchActive)}
              className="hover:text-neutral-700 dark:hover:text-neutral-200 p-0.5 rounded transition-colors cursor-pointer"
              title="Search sessions"
            >
              <Search size={14} strokeWidth={2} />
            </button>
            <button
              onClick={onToggleSidebar}
              className="hover:text-neutral-700 dark:hover:text-neutral-200 p-0.5 rounded transition-colors cursor-pointer"
              title="Collapse sidebar"
            >
              <PanelLeftClose size={14} strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Search Input Filter if Active */}
        {isSearchActive && (
          <div className="px-2 pb-1.5 animate-fadeIn">
            <input
              type="text"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Filter sessions..."
              className={`w-full px-2 py-1 text-xs rounded border focus:outline-none focus:ring-1 focus:ring-red-500 ${
                isDark ? 'bg-neutral-800 border-neutral-800 text-white' : 'bg-white border-neutral-300 text-neutral-800'
              }`}
              autoFocus
            />
          </div>
        )}

        {/* Top actions — plain text rows, grouped with quiet micro-labels. */}
        <div className="px-2 pt-1 pb-2 space-y-0.5">
          <div className="px-2.5 pb-0.5 text-[10px] font-semibold tracking-[0.08em] text-neutral-400 uppercase">Start</div>
          <button
            onClick={onNewAgent}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md transition-colors text-left font-normal cursor-pointer ${
              isDark ? 'hover:bg-white/5 text-neutral-200' : 'hover:bg-black/5 text-neutral-800'
            }`}
          >
            <span>New project</span>
            <span className="text-[11px] font-mono text-neutral-400">⌘N</span>
          </button>

          {onOpenFolder && (
            <button
              onClick={onOpenFolder}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md transition-colors text-left font-normal cursor-pointer ${
                isDark ? 'hover:bg-white/5 text-neutral-200' : 'hover:bg-black/5 text-neutral-800'
              }`}
              title="Open a folder on this device (Chrome/Edge/ChromeOS)"
            >
              <span>Open folder</span>
              <span className="text-[11px] font-mono text-neutral-400">⌘O</span>
            </button>
          )}

          {onCloneRepo && (
            <button
              onClick={onCloneRepo}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md transition-colors text-left font-normal cursor-pointer ${
                isDark ? 'hover:bg-white/5 text-neutral-200' : 'hover:bg-black/5 text-neutral-800'
              }`}
              title="Import a GitHub repository"
            >
              <span>Import repo</span>
            </button>
          )}

          <div className="px-2.5 pt-1.5 pb-0.5 text-[10px] font-semibold tracking-[0.08em] text-neutral-400 uppercase">Connect</div>
          {onOpenHost && (
            <button
              onClick={onOpenHost}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md transition-colors text-left font-normal cursor-pointer ${
                isDark ? 'hover:bg-white/5 text-neutral-200' : 'hover:bg-black/5 text-neutral-800'
              }`}
              title="Open the workspace on your zut host"
            >
              <span>{hostConnected ? 'Open host' : 'Connect host'}</span>
              {hostConnected && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
            </button>
          )}

          {onOpenGit && (
            <button
              onClick={onOpenGit}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md transition-colors text-left font-normal cursor-pointer ${
                isDark ? 'hover:bg-white/5 text-neutral-200' : 'hover:bg-black/5 text-neutral-800'
              }`}
              title="Host git: status, diff, commit, branches"
            >
              <span>Git</span>
              <span className="text-[10px] text-neutral-400">{hostConnected ? 'host' : ''}</span>
            </button>
          )}

          <div className="px-2.5 pt-1.5 pb-0.5 text-[10px] font-semibold tracking-[0.08em] text-neutral-400 uppercase">Tools</div>
          <button
            onClick={onOpenCommandPalette}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md transition-colors text-left font-normal cursor-pointer ${
              isDark ? 'hover:bg-white/5 text-neutral-200' : 'hover:bg-black/5 text-neutral-800'
            }`}
          >
            <span>Commands</span>
            <span className="text-[11px] font-mono text-neutral-400">⌘K</span>
          </button>

          <button
            onClick={onOpenRules}
            className={`w-full flex items-center px-2.5 py-1.5 rounded-md transition-colors text-left font-normal cursor-pointer ${
              isDark ? 'hover:bg-white/5 text-neutral-200' : 'hover:bg-black/5 text-neutral-800'
            }`}
          >
            <span>Customize</span>
          </button>
        </div>

        {workspaceLabel && (
          <div className="px-2.5 pb-1 text-[11px] text-neutral-400 truncate" title={`Workspace: ${workspaceLabel}`}>
            Workspace · {workspaceLabel}
          </div>
        )}

        {/* Task rail: what is running, what is ready for review */}
        {tasks && tasks.length > 0 && (
          <div className="px-2 pb-1 space-y-3 overflow-y-auto flex-1 min-h-0">
            {(['running', 'review'] as const).map((state) => {
              const group = tasks.filter((t) => t.state === state);
              if (group.length === 0) return null;
              return (
                <div key={state} className="space-y-0.5">
                  <div className="px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.08em] text-neutral-400 uppercase flex items-center gap-1.5">
                    {state === 'running' && (
                      <Loader2 size={10} className="animate-spin text-red-500" />
                    )}
                    <span>{state === 'running' ? 'In progress' : 'Ready for review'}</span>
                    <span className="text-neutral-400 font-mono">{group.length}</span>
                  </div>
                  {group.map((task) => (
                    <button
                      key={task.id}
                      onClick={() => onSelectItem(task.id)}
                      className={`w-full text-left px-2 py-1.5 rounded-md transition-colors cursor-pointer ${
                        activeItem === task.id
                          ? isDark
                            ? 'bg-white/8'
                            : 'bg-black/6'
                          : isDark
                            ? 'hover:bg-white/5'
                            : 'hover:bg-black/5'
                      }`}
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="flex items-center gap-1.5 min-w-0 flex-1">
                          {state === 'running' ? (
                            <Loader2 size={12} className="animate-spin text-red-500 shrink-0" />
                          ) : (
                            <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                          )}
                          <span className="text-[12px] font-medium truncate">{task.title}</span>
                        </span>
                        {task.time && (
                          <span className="text-[10px] text-neutral-400 shrink-0">{task.time}</span>
                        )}
                      </div>
                      {task.subtitle && (
                        <div className="text-[11px] text-neutral-400 truncate mt-0.5">
                          {task.subtitle}
                        </div>
                      )}
                      {(task.additions || task.deletions) ? (
                        <div className="text-[11px] font-mono mt-0.5">
                          {task.additions ? (
                            <span className="text-emerald-600 dark:text-emerald-400">+{task.additions}</span>
                          ) : null}
                          {task.additions && task.deletions ? <span className="text-neutral-400"> </span> : null}
                          {task.deletions ? (
                            <span className="text-red-600 dark:text-red-400">-{task.deletions}</span>
                          ) : null}
                        </div>
                      ) : null}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* Sections list */}
        <div className="px-2 space-y-3.5 overflow-y-auto flex-1 min-h-0 pb-4">
          {recents && recents.length > 0 && (
            <div className="space-y-0.5">
              <div className="px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.08em] text-neutral-400 uppercase">
                Recents
              </div>
              {recents.slice(0, 5).map((r) => (
                <div key={r.id} className="group/recent relative flex items-center">
                  <button
                    onClick={() => onOpenRecent?.(r.id)}
                    title={`Reopen “${r.name}” (${r.fileCount} files)`}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors cursor-pointer hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    <FolderOpen size={12} className="shrink-0 text-neutral-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] font-medium truncate">{r.name}</span>
                      <span className="block text-[10px] text-neutral-400 truncate">
                        {r.fileCount} file{r.fileCount === 1 ? '' : 's'} · {timeAgo(r.savedAt)}
                      </span>
                    </span>
                  </button>
                  <button
                    onClick={() => onRemoveRecent?.(r.id)}
                    title="Remove from recents"
                    aria-label={`Remove ${r.name} from recents`}
                    className="absolute right-1.5 p-1 rounded opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-opacity cursor-pointer"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {sections.map((section) => {
            if (section.title === 'Project') {
              return (
                <ProjectTree
                  key="project-tree"
                  items={section.items}
                  activeItem={activeItem}
                  onSelectItem={onSelectItem}
                  searchFilter={searchFilter}
                  isDark={isDark}
                />
              );
            }
            const filteredItems = section.items.filter((item) =>
              item.title.toLowerCase().includes(searchFilter.toLowerCase())
            );

            if (filteredItems.length === 0 && searchFilter) return null;

            return (
              <div key={section.title} className="space-y-0.5">
                <div className="px-2.5 py-0.5 text-[10px] font-semibold tracking-[0.08em] text-neutral-400 uppercase flex items-center justify-between">
                  <span>{section.title}</span>
                </div>

                {filteredItems.length === 0 && (
                  <div className="px-2.5 py-1.5 text-[11px] leading-[1.45] text-neutral-400">
                    {section.title === 'Project'
                      ? 'No files yet — start a new project or open a folder.'
                      : 'Nothing here yet.'}
                  </div>
                )}

                {filteredItems.map((item, index) => {
                  const isActive = activeItem === item.id;
                  if (item.isMore) {
                    return (
                      <button
                        key={item.id}
                        className="w-full flex items-center gap-1.5 px-2.5 py-1 rounded text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 text-[12px] transition-colors cursor-pointer"
                      >
                        <span>More</span>
                      </button>
                    );
                  }

                  return (
                    <div key={item.id} className="group/item relative flex items-center">
                      <button
                        onClick={() => onSelectItem(item.id)}
                        className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-[13px] transition-all cursor-pointer ${
                          isActive
                            ? isDark
                              ? 'bg-[#242429] text-white font-medium shadow-xs'
                              : 'bg-[#e7e7eb] text-neutral-900 font-medium shadow-2xs'
                            : isDark
                            ? 'text-neutral-300 hover:bg-white/5 font-normal'
                            : 'text-neutral-700 hover:bg-black/4 font-normal'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <span className="truncate">{item.title}</span>
                        </div>
                      </button>

                      {/* Reorder Buttons (Hover) */}
                      {onReorderItem && !item.isMore && (
                        <div className="absolute right-1 opacity-0 group-hover/item:opacity-100 flex items-center gap-0.5 bg-neutral-200/90 dark:bg-neutral-700/90 rounded px-1 py-0.5 z-10 transition-opacity">
                          {index > 0 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onReorderItem(section.title, item.id, 'up');
                              }}
                              className="text-neutral-600 dark:text-neutral-300 hover:text-black dark:hover:text-white"
                              title="Move up (⌥↑)"
                            >
                              <ChevronUp size={11} />
                            </button>
                          )}
                          {index < filteredItems.length - 2 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onReorderItem(section.title, item.id, 'down');
                              }}
                              className="text-neutral-600 dark:text-neutral-300 hover:text-black dark:hover:text-white"
                              title="Move down (⌥↓)"
                            >
                              <ChevronDown size={11} />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Profile User Bar */}
      <div
        className={`p-2 border-t shrink-0 transition-colors ${
          isDark ? 'border-neutral-800 bg-[#141416]' : 'border-[#e5e5e7]/80 bg-[#f4f4f6]'
        }`}
      >
        <div
          onClick={onOpenAccount || onOpenCommandPalette}
          className={`flex items-center justify-between px-1.5 py-1 rounded-md transition-colors cursor-pointer ${
            isDark ? 'hover:bg-white/5' : 'hover:bg-black/4'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {user?.email ? (
              <div
                className={`w-7 h-7 rounded-full shrink-0 ring-1 ring-black/10 flex items-center justify-center text-[11px] font-semibold ${
                  isDark ? 'bg-red-600 text-white' : 'bg-red-600 text-white'
                }`}
              >
                {initials}
              </div>
            ) : (
              <div
                className={`w-7 h-7 rounded-full shrink-0 ring-1 ring-black/10 flex items-center justify-center ${
                  isDark ? 'bg-neutral-700 text-neutral-300' : 'bg-neutral-200 text-neutral-500'
                }`}
              >
                <User size={14} />
              </div>
            )}
            <div className="flex flex-col min-w-0 leading-tight">
              <span
                className={`text-[12px] font-medium truncate ${
                  isDark ? 'text-neutral-100' : 'text-neutral-800'
                }`}
              >
                {displayName}
              </span>
              <span className="text-[11px] text-neutral-500 truncate">
                {displaySub}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
