import React, { useState } from 'react';
import { Sparkles, X, ArrowRight, Zap, Code, Terminal } from 'lucide-react';

interface NewAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (prompt: string, model: string) => void;
  theme?: 'light' | 'dark';
  models?: string[];
  templates?: Array<{ title: string; text: string }>;
}

export const NewAgentModal: React.FC<NewAgentModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  theme = 'light',
  models,
  templates,
}) => {
  const isDark = theme === 'dark';
  const modelOptions = models ?? ['Composer 2.5 Fast', 'Claude 3.7 Sonnet', 'GPT-4.5 Preview'];
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState(modelOptions[0]);

  const starterTemplates = templates ?? [
    {
      title: 'New Component',
      text: 'Create a new component following the existing patterns in this project.',
    },
    {
      title: 'Fix Layout',
      text: 'Review the active file for layout issues and fix what you find.',
    },
    {
      title: 'Explain Code',
      text: 'Explain what the active file does, section by section.',
    },
  ];

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-lg rounded-2xl shadow-2xl border overflow-hidden ${
          isDark ? 'bg-[#18181c] border-neutral-700 text-neutral-100' : 'bg-white border-neutral-200 text-neutral-800'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`h-11 px-4 flex items-center justify-between border-b ${
          isDark ? 'border-neutral-800 bg-[#1f1f25]' : 'border-neutral-200 bg-neutral-50'
        }`}>
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Sparkles size={15} className="text-indigo-500" />
            <span>Launch New Agent Session</span>
          </div>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600">
            <X size={15} />
          </button>
        </div>

        <div className="p-4 space-y-3.5 text-xs">
          <div>
            <label className="block text-[11px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5">
              What would you like the Agent to build or fix?
            </label>
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., Rewrite tab container layout to support vertical orientation and dynamic drag..."
              className={`w-full p-2.5 rounded-lg border text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${
                isDark ? 'bg-[#25252b] border-neutral-700 text-white placeholder-neutral-500' : 'bg-neutral-50 border-neutral-300 text-neutral-800 placeholder-neutral-400'
              }`}
              autoFocus
            />
          </div>

          <div>
            <span className="block text-[11px] font-medium text-neutral-400 mb-1.5">
              Quick start templates:
            </span>
            <div className="space-y-1.5">
              {starterTemplates.map((tpl, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPrompt(tpl.text)}
                  className={`w-full text-left p-2 rounded-lg border text-[11.5px] transition-colors flex items-center justify-between ${
                    isDark ? 'border-neutral-800 hover:bg-neutral-800/60' : 'border-neutral-200 hover:bg-neutral-50'
                  }`}
                >
                  <span className="font-medium">{tpl.title}</span>
                  <ArrowRight size={11} className="text-neutral-400" />
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-neutral-200 dark:border-neutral-800">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-neutral-400">Model:</span>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className={`text-[11px] px-2 py-1 rounded border ${
                  isDark ? 'bg-neutral-800 border-neutral-700 text-neutral-200' : 'bg-white border-neutral-300 text-neutral-700'
                }`}
              >
                {modelOptions.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

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
                disabled={!prompt.trim()}
                onClick={() => {
                  if (prompt.trim()) {
                    onSubmit(prompt.trim(), model);
                    onClose();
                  }
                }}
                className="px-3.5 py-1.5 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-medium flex items-center gap-1.5 shadow-sm hover:opacity-90 transition-opacity disabled:opacity-40"
              >
                <Sparkles size={13} />
                <span>Start Agent</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
