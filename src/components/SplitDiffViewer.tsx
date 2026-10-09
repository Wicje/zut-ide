import React from 'react';
import { DiffFile, DiffLine } from '../types';

interface SplitDiffViewerProps {
  file: DiffFile;
  theme?: 'light' | 'dark';
}

export const SplitDiffViewer: React.FC<SplitDiffViewerProps> = ({ file, theme = 'light' }) => {
  const isDark = theme === 'dark';

  // Pair up deletions and additions for side-by-side view
  const rows: { left: DiffLine | null; right: DiffLine | null }[] = [];

  let i = 0;
  while (i < file.lines.length) {
    const line = file.lines[i];

    if (line.type === 'context') {
      rows.push({ left: line, right: line });
      i++;
    } else if (line.type === 'delete') {
      // Look ahead for corresponding addition
      const nextLine = file.lines[i + 1];
      if (nextLine && nextLine.type === 'add') {
        rows.push({ left: line, right: nextLine });
        i += 2;
      } else {
        rows.push({ left: line, right: null });
        i++;
      }
    } else if (line.type === 'add') {
      rows.push({ left: null, right: line });
      i++;
    } else {
      i++;
    }
  }

  return (
    <div className="grid grid-cols-2 divide-x divide-[#e5e5e7] dark:divide-neutral-800 text-[12px] font-code leading-[20px]">
      {/* Left Column: Original */}
      <div className="overflow-x-auto">
        <div className={`px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider sticky top-0 z-10 ${
          isDark ? 'bg-neutral-800/90 text-neutral-400' : 'bg-neutral-100/90 text-neutral-500'
        }`}>
          Original (Before)
        </div>
        {rows.map((row, idx) => {
          if (!row.left) {
            return (
              <div key={`l-empty-${idx}`} className={`h-[20px] ${isDark ? 'bg-neutral-900/50' : 'bg-neutral-100/40'}`}>
                &nbsp;
              </div>
            );
          }
          const isDel = row.left.type === 'delete';
          return (
            <div
              key={`l-${idx}`}
              className={`flex items-start ${
                isDel
                  ? isDark
                    ? 'bg-[#3b1219]'
                    : 'bg-[#ffeef0]'
                  : isDark
                  ? 'hover:bg-white/4'
                  : 'hover:bg-neutral-50/50'
              }`}
            >
              <div className={`w-8 shrink-0 pr-2 text-right select-none ${
                isDel
                  ? isDark
                    ? 'text-[#f85149] font-medium'
                    : 'text-[#cf222e] font-medium'
                  : isDark
                  ? 'text-[#6e7681]'
                  : 'text-[#8c959f]'
              }`}>
                {row.left.oldLineNumber || ''}
              </div>
              <div className={`flex-1 px-2 whitespace-pre ${isDark ? 'text-neutral-300' : 'text-neutral-800'}`}>
                {row.left.content}
              </div>
            </div>
          );
        })}
      </div>

      {/* Right Column: Modified */}
      <div className="overflow-x-auto">
        <div className={`px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider sticky top-0 z-10 ${
          isDark ? 'bg-neutral-800/90 text-neutral-400' : 'bg-neutral-100/90 text-neutral-500'
        }`}>
          Modified (After)
        </div>
        {rows.map((row, idx) => {
          if (!row.right) {
            return (
              <div key={`r-empty-${idx}`} className={`h-[20px] ${isDark ? 'bg-neutral-900/50' : 'bg-neutral-100/40'}`}>
                &nbsp;
              </div>
            );
          }
          const isAdd = row.right.type === 'add';
          return (
            <div
              key={`r-${idx}`}
              className={`flex items-start ${
                isAdd
                  ? isDark
                    ? 'bg-[#122818]'
                    : 'bg-[#e6ffed]'
                  : isDark
                  ? 'hover:bg-white/4'
                  : 'hover:bg-neutral-50/50'
              }`}
            >
              <div className={`w-8 shrink-0 pr-2 text-right select-none ${
                isAdd
                  ? isDark
                    ? 'text-[#56d364] font-medium'
                    : 'text-[#1a7f37] font-medium'
                  : isDark
                  ? 'text-[#6e7681]'
                  : 'text-[#8c959f]'
              }`}>
                {row.right.newLineNumber || ''}
              </div>
              <div className={`flex-1 px-2 whitespace-pre ${isDark ? 'text-neutral-300' : 'text-neutral-800'}`}>
                {row.right.content}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
