import React, { useState } from 'react';
import { X, Sparkles, Check, Save, FileText, ArrowRight } from 'lucide-react';

interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveRules: (rules: string) => void;
  theme?: 'light' | 'dark';
  initialRules?: string;
}

const DEFAULT_RULES = `# Project Agent Rules
- Always write strict TypeScript with exact return types. Never use \`any\`.
- Use Tailwind CSS v4 utility classes. Avoid inline styles and separate CSS files.
- Prefer functional components and React hooks.`;

export const RulesModal: React.FC<RulesModalProps> = ({
  isOpen,
  onClose,
  onSaveRules,
  theme = 'light',
  initialRules,
}) => {
  const isDark = theme === 'dark';
  const [rules, setRules] = useState<string>(initialRules ?? DEFAULT_RULES);
  const directiveCount = rules.split('\n').filter((l) => l.trim().startsWith('-')).length;

  React.useEffect(() => {
    if (isOpen && initialRules !== undefined) setRules(initialRules);
  }, [isOpen, initialRules]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 max-sm:p-2 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-lg rounded-2xl shadow-2xl border overflow-hidden max-sm:w-full max-sm:max-w-full max-sm:max-h-[calc(100dvh-2rem)] ${
          isDark
            ? 'bg-[#18181c] border-neutral-700 text-neutral-100'
            : 'bg-white border-neutral-200 text-neutral-800'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`h-11 px-4 border-b flex items-center justify-between ${
            isDark ? 'border-neutral-800 bg-[#1f1f25]' : 'border-neutral-200 bg-neutral-50'
          }`}
        >
          <div className="flex items-center gap-2 text-xs font-semibold">
            <FileText size={15} className="text-red-500" />
            <span>Project Agent Guidelines</span>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600">
            <X size={15} />
          </button>
        </div>

        <div className="p-4 space-y-3.5 text-xs">
          <p className="text-[11.5px] text-neutral-500">
            The Agent reads these guidelines on every prompt and diff turn to enforce code style, design systems, and testing conventions.
          </p>

          <textarea
            rows={8}
            value={rules}
            onChange={(e) => setRules(e.target.value)}
            className={`w-full p-3 font-code text-[11.5px] rounded-xl border leading-relaxed focus:outline-none focus:ring-2 focus:ring-red-500/30 ${
              isDark
                ? 'bg-[#222227] border-neutral-700 text-neutral-200'
                : 'bg-neutral-50 border-neutral-300 text-neutral-800'
            }`}
          />

          <div className="flex items-center justify-between pt-2 border-t border-neutral-200 dark:border-neutral-800">
            <span className="text-[11px] text-neutral-400">
              {directiveCount} project directive{directiveCount === 1 ? '' : 's'} active
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-lg border border-neutral-300 dark:border-neutral-700 text-neutral-500 font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onSaveRules(rules);
                  onClose();
                }}
                className="px-3.5 py-1.5 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-medium flex items-center gap-1.5 shadow-sm hover:opacity-90"
              >
                <Save size={13} />
                <span>Save Guidelines</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
