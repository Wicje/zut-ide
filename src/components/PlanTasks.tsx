import React, { useState } from 'react';
import { Check, Plus } from 'lucide-react';

// The task list of a plan document.
//
// A plan is a markdown file; its checklist items (`- [ ] …`) are the tasks.
// Ticking one rewrites the file, so the plan on disk and the list here never
// disagree. The composer can also add a task with ⌘K.

export interface PlanTask {
  /** The raw line, so toggling rewrites exactly that line. */
  line: string;
  text: string;
  done: boolean;
}

const TASK_LINE = /^(\s*)[-*]\s+\[([ xX])\]\s*(.*)$/;

export function parsePlanTasks(content: string): PlanTask[] {
  const out: PlanTask[] = [];
  for (const line of content.split('\n')) {
    const m = TASK_LINE.exec(line);
    if (!m) continue;
    out.push({ line, text: (m[3] ?? '').trim(), done: (m[2] ?? ' ').toLowerCase() === 'x' });
  }
  return out;
}

/** Rewrites one checklist line as done or not done. */
export function toggleTaskLine(line: string, done: boolean): string {
  return line.replace(/^(\s*[-*]\s+\[)([ xX])(\])/, (_m, a, _b, c) => `${a}${done ? 'x' : ' '}${c}`);
}

/** Appends a new task to the end of the document. */
export function appendTask(content: string, text: string): string {
  const body = text.trim();
  if (!body) return content;
  const base = content.endsWith('\n') || content === '' ? content : `${content}\n`;
  return `${base}- [ ] ${body}\n`;
}

interface PlanTasksProps {
  content: string;
  onChange: (next: string) => void;
  theme?: 'light' | 'dark';
  onRequestAgent?: () => void;
}

export const PlanTasks: React.FC<PlanTasksProps> = ({ content, onChange, theme = 'light', onRequestAgent }) => {
  const isDark = theme === 'dark';
  const [draft, setDraft] = useState('');
  const tasks = parsePlanTasks(content);

  return (
    <div
      className={`shrink-0 px-4 py-3 border-b ${
        isDark ? 'border-neutral-800 bg-[#141416]' : 'border-[#e5e5e7] bg-[#f4f4f6]'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className={`text-[12px] font-semibold ${isDark ? 'text-neutral-200' : 'text-neutral-800'}`}>
          {tasks.length} {tasks.length === 1 ? 'Task' : 'Tasks'}
        </span>
      </div>

      <div className="space-y-1.5">
        {tasks.map((task, i) => (
          <button
            key={`${i}-${task.text}`}
            onClick={() => {
              const lines = content.split('\n');
              const index = lines.indexOf(task.line);
              if (index < 0) return;
              lines[index] = toggleTaskLine(task.line, !task.done);
              onChange(lines.join('\n'));
            }}
            className="w-full flex items-start gap-2 text-left cursor-pointer group"
          >
            <span
              className={`mt-0.5 w-3.5 h-3.5 rounded-full border shrink-0 flex items-center justify-center transition-colors ${
                task.done
                  ? 'border-emerald-500 bg-emerald-500 text-white'
                  : isDark
                    ? 'border-neutral-600 group-hover:border-neutral-400'
                    : 'border-neutral-300 group-hover:border-neutral-500'
              }`}
            >
              {task.done && <Check size={9} strokeWidth={3} />}
            </span>
            <span
              className={`text-[12.5px] leading-[1.4] ${
                task.done
                  ? 'text-neutral-400 line-through'
                  : isDark
                    ? 'text-neutral-200'
                    : 'text-neutral-800'
              }`}
            >
              {task.text}
            </span>
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          onChange(appendTask(content, draft));
          setDraft('');
        }}
        className="mt-2.5 flex items-center gap-1.5"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !draft.trim() && onRequestAgent) {
              e.preventDefault();
              onRequestAgent();
            }
          }}
          placeholder="Add a task, ⌘K to generate..."
          className={`flex-1 min-w-0 bg-transparent text-[12.5px] outline-none placeholder-neutral-400 ${
            isDark ? 'text-neutral-100' : 'text-neutral-800'
          }`}
        />
        {draft.trim() && (
          <button
            type="submit"
            className={`w-5 h-5 rounded-md flex items-center justify-center cursor-pointer ${
              isDark ? 'bg-white text-neutral-900' : 'bg-neutral-900 text-white'
            }`}
            title="Add task"
          >
            <Plus size={12} />
          </button>
        )}
      </form>
    </div>
  );
};
