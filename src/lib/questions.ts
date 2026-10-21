// The agent can ask a question instead of guessing.
//
// It ends its reply with a questions block:
//
//   [questions]
//   How should the panel open?
//   1. Gesture
//   2. Keyboard shortcut
//   [/questions]
//
// The IDE turns that into a card: pick an option (or skip) and the answer
// goes back to the agent as the next turn.

export interface AgentQuestion {
  question: string;
  options: string[];
}

const START = '[questions]';
const END = '[/questions]';

export function parseQuestions(reply: string): AgentQuestion | null {
  const start = reply.indexOf(START);
  if (start < 0) return null;
  const end = reply.indexOf(END, start);
  const body = reply.slice(start + START.length, end < 0 ? undefined : end);
  const lines = body
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return null;

  const options: string[] = [];
  const head: string[] = [];
  for (const line of lines) {
    const option = /^\d+[.)]\s*(.+)$/.exec(line);
    if (option) options.push(option[1].trim());
    else head.push(line);
  }
  const question = head.join(' ').trim();
  if (!question || options.length === 0) return null;
  return { question, options };
}

/** The reply without the questions block — that part is a card, not prose. */
export function stripQuestions(reply: string): string {
  const start = reply.indexOf(START);
  if (start < 0) return reply;
  const end = reply.indexOf(END, start);
  return (reply.slice(0, start) + (end < 0 ? '' : reply.slice(end + END.length))).trim();
}

/** What the agent gets back: the question, the answer, and the rest. */
export function answersPrompt(question: AgentQuestion, choice: number | null): string {
  const answer = choice === null ? 'Skip — make the call yourself and say what you chose.' : question.options[choice];
  return [`Question: ${question.question}`, `Answer: ${answer}`].join('\n');
}
