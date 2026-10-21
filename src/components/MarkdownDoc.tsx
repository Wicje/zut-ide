import React from 'react';

// A small markdown renderer — enough for the documents the agent writes:
// headings, paragraphs, lists, code, quotes, rules and inline emphasis.
// No dependency, no HTML injection: the source is escaped and only the
// markdown we understand becomes elements.

function inline(text: string, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  // code, bold, italic, links — in that order, escaped.
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const token = m[0];
    const key = `${keyPrefix}-i${i++}`;
    if (token.startsWith('`')) {
      out.push(
        <code key={key} className="px-1 py-0.5 rounded bg-black/5 dark:bg-white/10 font-mono text-[0.92em]">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('**')) {
      out.push(
        <strong key={key} className="font-semibold">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith('[')) {
      const label = token.slice(1, token.indexOf(']'));
      const href = token.slice(token.indexOf('](') + 2, -1);
      out.push(
        <a key={key} href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
          {label}
        </a>,
      );
    } else {
      out.push(
        <em key={key} className="italic">
          {token.slice(1, -1)}
        </em>,
      );
    }
    last = m.index + token.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export const MarkdownDoc: React.FC<{ content: string; theme?: 'light' | 'dark' }> = ({ content, theme = 'light' }) => {
  const isDark = theme === 'dark';
  const lines = content.split('\n');
  const blocks: React.ReactNode[] = [];

  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];

    // fenced code
    if (/^\s*```/.test(line)) {
      const lang = line.trim().slice(3).trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      i++;
      blocks.push(
        <pre
          key={`b${key++}`}
          className={`my-3 overflow-x-auto rounded-lg p-3 font-mono text-[12px] leading-[1.5] ${
            isDark ? 'bg-[#111114] text-neutral-200 border border-neutral-800' : 'bg-neutral-100 text-neutral-800 border border-neutral-200'
          }`}
        >
          {lang ? <div className="text-[10px] uppercase tracking-wide text-neutral-400 mb-1.5">{lang}</div> : null}
          {body.join('\n')}
        </pre>,
      );
      continue;
    }

    // heading
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const size = ['text-[24px]', 'text-[20px]', 'text-[17px]', 'text-[15px]', 'text-[14px]', 'text-[13px]'][level - 1];
      const weight = level <= 2 ? 'font-semibold' : 'font-semibold';
      blocks.push(
        <h2
          key={`b${key++}`}
          className={`${size} ${weight} mt-5 mb-2 first:mt-0 tracking-tight ${
            isDark ? 'text-neutral-100' : 'text-neutral-900'
          }`}
        >
          {inline(heading[2], `h${key}`)}
        </h2>,
      );
      i++;
      continue;
    }

    // rule
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      blocks.push(<hr key={`b${key++}`} className={`my-4 border-t ${isDark ? 'border-neutral-800' : 'border-neutral-200'}`} />);
      i++;
      continue;
    }

    // list
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ''));
        i++;
      }
      const List = ordered ? 'ol' : 'ul';
      blocks.push(
        <List
          key={`b${key++}`}
          className={`my-2 pl-5 space-y-1.5 text-[13.5px] leading-[1.55] ${
            isDark ? 'text-neutral-300' : 'text-neutral-700'
          }`}
        >
          {items.map((item, n) => (
            <li key={n} className="marker:text-neutral-400">
              {inline(item, `li${key}-${n}`)}
            </li>
          ))}
        </List>,
      );
      continue;
    }

    // quote
    if (/^\s*>\s?/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        body.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      blocks.push(
        <blockquote
          key={`b${key++}`}
          className={`my-3 pl-3 border-l-2 text-[13.5px] italic ${
            isDark ? 'border-neutral-700 text-neutral-400' : 'border-neutral-300 text-neutral-600'
          }`}
        >
          {inline(body.join(' '), `q${key}`)}
        </blockquote>,
      );
      continue;
    }

    // blank
    if (!line.trim()) {
      i++;
      continue;
    }

    // paragraph
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^\s*(```|#{1,6}\s|[-*]\s|\d+\.\s|>)/.test(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      <p
        key={`b${key++}`}
        className={`my-2.5 text-[13.5px] leading-[1.6] ${isDark ? 'text-neutral-300' : 'text-neutral-700'}`}
      >
        {inline(para.join(' '), `p${key}`)}
      </p>,
    );
  }

  return (
    <div className={`flex-1 overflow-y-auto px-6 py-5 max-w-[760px] ${isDark ? 'text-neutral-200' : 'text-neutral-800'}`}>
      {blocks}
    </div>
  );
};
