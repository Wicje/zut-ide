import React, { useState } from 'react';
import {
  Sparkles,
  Layers,
  SlidersHorizontal,
  Search,
  PanelLeftClose,
  MoreHorizontal,
  FileText,
  LayoutTemplate,
  Bell,
  Settings,
  Sliders,
  GitBranch,
  ChevronUp,
  ChevronDown,
  User,
} from 'lucide-react';
import { SidebarSection, SidebarItem } from '../types';

interface SidebarProps {
  sections: SidebarSection[];
  onReorderItem?: (sectionTitle: string, itemId: string, direction: 'up' | 'down') => void;
  activeItem: string;
  onSelectItem: (id: string) => void;
  onNewAgent?: () => void;
  onOpenCommandPalette?: () => void;
  onOpenAccount?: () => void;
  onOpenRules?: () => void;
  onToggleSidebar?: () => void;
  user?: { name: string; email: string } | null;
  theme?: 'light' | 'dark';
}

export const Sidebar: React.FC<SidebarProps> = ({
  sections,
  onReorderItem,
  activeItem,
  onSelectItem,
  onNewAgent,
  onOpenCommandPalette,
  onOpenAccount,
  onOpenRules,
  onToggleSidebar,
  user,
  theme = 'light',
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
      className={`w-[210px] shrink-0 border-r flex flex-col justify-between h-full select-none text-[13px] transition-colors ${
        isDark
          ? 'bg-[#141416] text-neutral-300 border-neutral-800'
          : 'bg-[#f4f4f6] text-[#2b2b2f] border-[#e5e5e7]'
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
                isDark ? 'bg-neutral-800 border-neutral-700 text-white' : 'bg-white border-neutral-300 text-neutral-800'
              }`}
              autoFocus
            />
          </div>
        )}

        {/* Top actions */}
        <div className="px-2 pt-1 pb-2 space-y-0.5">
          <button
            onClick={onNewAgent}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md transition-colors text-left font-normal cursor-pointer ${
              isDark ? 'hover:bg-white/5 text-neutral-200' : 'hover:bg-black/5 text-neutral-800'
            }`}
          >
            <div className="flex items-center gap-2">
              <Sparkles size={15} className="text-neutral-500" />
              <span>New project</span>
            </div>
            <span className="text-[11px] font-mono text-neutral-400">⌘N</span>
          </button>

          <button
            onClick={onOpenCommandPalette}
            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md transition-colors text-left font-normal cursor-pointer ${
              isDark ? 'hover:bg-white/5 text-neutral-200' : 'hover:bg-black/5 text-neutral-800'
            }`}
          >
            <div className="flex items-center gap-2">
              <Layers size={15} className="text-neutral-500" />
              <span>Commands</span>
            </div>
            <span className="text-[11px] font-mono text-neutral-400">⌘K</span>
          </button>

          <button
            onClick={onOpenRules}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors text-left font-normal cursor-pointer ${
              isDark ? 'hover:bg-white/5 text-neutral-200' : 'hover:bg-black/5 text-neutral-800'
            }`}
          >
            <SlidersHorizontal size={15} className="text-neutral-500" />
            <span>Customize</span>
          </button>
        </div>

        {/* Sections list */}
        <div className="px-2 space-y-3.5 overflow-y-auto flex-1 min-h-0 pb-4">
          {sections.map((section) => {
            const filteredItems = section.items.filter((item) =>
              item.title.toLowerCase().includes(searchFilter.toLowerCase())
            );

            if (filteredItems.length === 0 && searchFilter) return null;

            return (
              <div key={section.title} className="space-y-0.5">
                <div className="px-2.5 py-0.5 text-[11px] font-medium text-neutral-400 tracking-tight flex items-center justify-between">
                  <span>{section.title}</span>
                </div>

                {filteredItems.map((item, index) => {
                  const isActive = activeItem === item.id;
                  if (item.isMore) {
                    return (
                      <button
                        key={item.id}
                        className="w-full flex items-center gap-1.5 px-2.5 py-1 rounded text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 text-[12px] transition-colors cursor-pointer"
                      >
                        <MoreHorizontal size={13} />
                        <span>More</span>
                      </button>
                    );
                  }

                  return (
                    <div key={item.id} className="group/item relative flex items-center">
                      <button
                        onClick={() => onSelectItem(item.id)}
                        className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-[12.5px] transition-all cursor-pointer ${
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
                          {isActive ? (
                            <MoreHorizontal size={13} className="text-neutral-400 shrink-0" />
                          ) : item.badge === 'blue' ? (
                            <span className="w-1.5 h-1.5 rounded-full bg-[#e5484d] shrink-0" />
                          ) : (
                            <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 dark:bg-neutral-600 shrink-0" />
                          )}
                          <span className="truncate">{item.title}</span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0 ml-1">
                          {isActive && <GitBranch size={12} className="text-neutral-400" />}
                          {item.hasIcon && item.iconType === 'card' && (
                            <FileText size={12} className="text-neutral-400" />
                          )}
                          {item.hasIcon && item.iconType === 'panel' && (
                            <LayoutTemplate size={12} className="text-neutral-400" />
                          )}
                          {item.hasIcon && item.iconType === 'toast' && (
                            <Bell size={12} className="text-neutral-400" />
                          )}
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
              <span className="text-[10.5px] text-neutral-500 truncate">
                {displaySub}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-neutral-400">
            <button
              className="hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors p-0.5"
              title="Filter & View"
            >
              <Sliders size={13} />
            </button>
            <button
              className="hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors p-0.5"
              title="Settings & Preferences"
            >
              <Settings size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
