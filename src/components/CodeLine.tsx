import React, { useState } from 'react';
import { DiffLine, LineComment } from '../types';
import { MessageSquarePlus, MessageSquare, Send, CheckCircle2, Sparkles, X } from 'lucide-react';

interface CodeLineProps {
  line: DiffLine;
  index: number;
  onAddComment?: (lineId: string, commentText: string) => void;
  onAskComposer?: (lineContent: string) => void;
  theme?: 'light' | 'dark';
}

export const CodeLine: React.FC<CodeLineProps> = ({
  line,
  index,
  onAddComment,
  onAskComposer,
  theme = 'light',
}) => {
  const isDark = theme === 'dark';
  const isDelete = line.type === 'delete';
  const isAdd = line.type === 'add';

  const [isCommentBoxOpen, setIsCommentBoxOpen] = useState(false);
  const [newCommentText, setNewCommentText] = useState('');
  const [localComments, setLocalComments] = useState<LineComment[]>(line.comments || []);

  const handleCreateComment = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newCommentText.trim()) return;

    const newComment: LineComment = {
      id: `c-${Date.now()}`,
      author: 'You',
      text: newCommentText.trim(),
      createdAt: 'Just now',
    };

    setLocalComments((prev) => [...prev, newComment]);
    if (onAddComment && line.id) {
      onAddComment(line.id, newCommentText.trim());
    }
    setNewCommentText('');
    setIsCommentBoxOpen(false);
  };

  // Render tokens
  const renderHighlightedCode = (text: string, highlightTokens?: { text: string; type: 'del' | 'add' }[]) => {
    if (!text) return <span>&nbsp;</span>;

    if (highlightTokens && highlightTokens.length > 0) {
      let parts: { text: string; isHighlight: boolean; highlightType?: 'del' | 'add' }[] = [
        { text, isHighlight: false },
      ];

      for (const token of highlightTokens) {
        const newParts: typeof parts = [];
        for (const part of parts) {
          if (part.isHighlight) {
            newParts.push(part);
            continue;
          }
          const idx = part.text.indexOf(token.text);
          if (idx !== -1) {
            const before = part.text.substring(0, idx);
            const match = part.text.substring(idx, idx + token.text.length);
            const after = part.text.substring(idx + token.text.length);
            if (before) newParts.push({ text: before, isHighlight: false });
            newParts.push({ text: match, isHighlight: true, highlightType: token.type });
            if (after) newParts.push({ text: after, isHighlight: false });
          } else {
            newParts.push(part);
          }
        }
        parts = newParts;
      }

      return (
        <span>
          {parts.map((p, i) => {
            if (p.isHighlight) {
              const bgClass =
                p.highlightType === 'del'
                  ? isDark
                    ? 'bg-[#5c2024] text-[#ffb0b8]'
                    : 'bg-[#ffc0c7] text-[#86181d]'
                  : isDark
                  ? 'bg-[#1b4728] text-[#9aedaf]'
                  : 'bg-[#acf2bd] text-[#144620]';
              return (
                <span key={i} className={`${bgClass} rounded-xs px-0.5 font-medium`}>
                  {colorizeTokens(p.text, isDark)}
                </span>
              );
            }
            return <span key={i}>{colorizeTokens(p.text, isDark)}</span>;
          })}
        </span>
      );
    }

    return colorizeTokens(text, isDark);
  };

  const colorizeTokens = (str: string, dark: boolean) => {
    const tokens = str.split(
      /(\b(?:const|let|var|return|function|export|import|from|type|if|else)\b|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\b(?:useMemo|useCallback|useRef|useEffect|useResizeObserver|PinnedTabItem|setHovered)\b|<\/?[a-zA-Z0-9_-]+|\b(?:className|title|onMouseEnter|onMouseLeave|isCompact|isPinned|tab|isActive|onTabClick|ref|callback)\b|[{}():;=,])/g
    );

    return tokens.map((tok, i) => {
      if (!tok) return null;

      if (['const', 'let', 'var', 'return', 'function', 'export', 'import', 'from', 'type', 'if', 'else'].includes(tok)) {
        return (
          <span key={i} className={`${dark ? 'text-[#ff7b72]' : 'text-[#cf222e]'} font-medium`}>
            {tok}
          </span>
        );
      }
      if (tok.startsWith('"') || tok.startsWith("'")) {
        return (
          <span key={i} className={dark ? 'text-[#a5d6ff]' : 'text-[#0a3069]'}>
            {tok}
          </span>
        );
      }
      if (['useMemo', 'useCallback', 'useRef', 'useEffect', 'useResizeObserver', 'PinnedTabItem', 'setHovered'].includes(tok)) {
        return (
          <span key={i} className={dark ? 'text-[#d2a8ff]' : 'text-[#6f42c1]'}>
            {tok}
          </span>
        );
      }
      if (tok.startsWith('<')) {
        return (
          <span key={i} className={`${dark ? 'text-[#7ee787]' : 'text-[#116329]'} font-medium`}>
            {tok}
          </span>
        );
      }
      if (/^\d+(\.\d+)?$/.test(tok)) {
        return (
          <span key={i} className={dark ? 'text-[#79c0ff]' : 'text-[#0550ae]'}>
            {tok}
          </span>
        );
      }
      return <span key={i} className={dark ? 'text-[#c9d1d9]' : 'text-[#24292f]'}>{tok}</span>;
    });
  };

  const lineBg = isDark
    ? isDelete
      ? 'bg-[#3b1219]'
      : isAdd
      ? 'bg-[#122818]'
      : 'hover:bg-white/4'
    : isDelete
    ? 'bg-[#ffeef0]'
    : isAdd
    ? 'bg-[#e6ffed]'
    : 'hover:bg-neutral-50/50';

  const lineNumberColor = isDark
    ? isDelete
      ? 'text-[#f85149] font-medium'
      : isAdd
      ? 'text-[#56d364] font-medium'
      : 'text-[#6e7681]'
    : isDelete
    ? 'text-[#cf222e] font-medium'
    : isAdd
    ? 'text-[#1a7f37] font-medium'
    : 'text-[#8c959f]';

  return (
    <div className="flex flex-col">
      <div className={`group relative flex items-start text-[12px] leading-[20px] font-code select-text ${lineBg}`}>
        {/* Comment Trigger Button on Hover */}
        <div className="w-5 shrink-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => setIsCommentBoxOpen(!isCommentBoxOpen)}
            className={`w-4 h-4 rounded flex items-center justify-center ${
              isDark ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-red-500 text-white hover:bg-red-600'
            } shadow-xs text-[9px]`}
            title="Add inline review comment"
          >
            +
          </button>
        </div>

        {/* Line number gutter */}
        <div className={`w-9 shrink-0 pr-2.5 text-right select-none ${lineNumberColor}`}>
          {line.oldLineNumber !== undefined && line.oldLineNumber !== '' ? line.oldLineNumber : line.newLineNumber || ''}
        </div>

        {/* Code content */}
        <div className="flex-1 px-2 whitespace-pre overflow-x-auto">
          {renderHighlightedCode(line.content, line.highlightTokens)}
        </div>

        {/* Quick Ask Composer Action on hover */}
        {onAskComposer && line.content.trim() && (
          <button
            onClick={() => onAskComposer(line.content.trim())}
            className={`opacity-0 group-hover:opacity-100 transition-opacity mr-2 flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${
              isDark ? 'bg-neutral-800 text-neutral-300 hover:text-white border border-neutral-700' : 'bg-white text-neutral-600 hover:text-neutral-900 border border-neutral-200'
            }`}
            title="Ask Composer about this line"
          >
            <Sparkles size={10} className="text-red-500" />
            <span className="hidden sm:inline font-sans">Ask</span>
          </button>
        )}
      </div>

      {/* Inline Comments Thread */}
      {localComments.length > 0 && (
        <div className={`mx-10 my-1.5 p-3 rounded-lg border text-xs font-sans ${
          isDark ? 'bg-[#1c1c21] border-neutral-700 text-neutral-200' : 'bg-neutral-50 border-neutral-200 text-neutral-800'
        }`}>
          <div className="space-y-2">
            {localComments.map((comment) => (
              <div key={comment.id} className="flex items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-[11px]">{comment.author}</span>
                    <span className="text-[10px] text-neutral-400">{comment.createdAt}</span>
                  </div>
                  <p className="text-[12px] leading-relaxed">{comment.text}</p>
                </div>
                <button
                  onClick={() => setLocalComments((prev) => prev.filter((c) => c.id !== comment.id))}
                  className="text-neutral-400 hover:text-green-600 transition-colors p-0.5"
                  title="Resolve comment"
                >
                  <CheckCircle2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Inline Comment Creation Box */}
      {isCommentBoxOpen && (
        <div className={`mx-10 my-1.5 p-3 rounded-lg border text-xs font-sans shadow-md animate-fadeIn ${
          isDark ? 'bg-[#18181b] border-neutral-700 text-neutral-200' : 'bg-white border-neutral-300 text-neutral-800'
        }`}>
          <form onSubmit={handleCreateComment} className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-neutral-500">
                Add review comment to line {line.oldLineNumber || line.newLineNumber}
              </span>
              <button
                type="button"
                onClick={() => setIsCommentBoxOpen(false)}
                className="text-neutral-400 hover:text-neutral-600"
              >
                <X size={12} />
              </button>
            </div>
            <textarea
              rows={2}
              value={newCommentText}
              onChange={(e) => setNewCommentText(e.target.value)}
              placeholder="Leave a comment or suggestion..."
              className={`w-full p-2 text-xs rounded border focus:outline-none focus:ring-1 focus:ring-red-500 ${
                isDark ? 'bg-[#27272a] border-neutral-700 text-white placeholder-neutral-500' : 'bg-white border-neutral-200 placeholder-neutral-400'
              }`}
              autoFocus
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCommentBoxOpen(false)}
                className="px-2.5 py-1 text-[11px] text-neutral-500 hover:text-neutral-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white rounded text-[11px] font-medium flex items-center gap-1 shadow-xs"
              >
                <Send size={10} />
                <span>Comment</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
