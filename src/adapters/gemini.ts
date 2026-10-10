// Direct Gemini agent: browser -> Google with the user's own key (BYOK).
// Replies follow the edit-block protocol so file changes are reviewable
// diffs, never silent overwrites.
import { GoogleGenAI } from '@google/genai';
import { loadRules } from './zut';
import { parseEdits, stripEditBlocks, type ProposedEdit } from './aiEdits';
import type { FileMap } from './filemap';
import { connectorsPromptBlock } from '../lib/connectors';

export const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'] as const;

const KEY_LS = 'gpide:gemini:key';
const envKey = (import.meta.env.VITE_GEMINI_API_KEY as string | undefined) || (import.meta.env.GEMINI_API_KEY as string | undefined);

export function getGeminiKey(): string | null {
  try {
    return localStorage.getItem(KEY_LS) ?? envKey ?? null;
  } catch {
    return envKey ?? null;
  }
}

export function setGeminiKey(key: string): void {
  try {
    localStorage.setItem(KEY_LS, key);
  } catch {
    /* ignore */
  }
}

const EDIT_PROTOCOL = [
  'When you propose a code change, output the complete new file so it can be reviewed as a diff.',
  'For each file you create or modify, include a fenced block in exactly this form:',
  '',
  '```edit:path/to/file',
  '<the full new contents of the file>',
  '```',
  '',
  'Put explanations in normal prose outside the blocks. Only emit an edit block when you intend to change that file.',
].join('\n');

export function buildSystemPrompt(
  projectName: string,
  files: FileMap,
  activePath: string,
  extra?: string,
): string {
  const names = Object.keys(files).sort();
  const parts = [
    'You are a coding assistant inside a browser IDE. Help improve the code with short explanations.',
    '',
    `Project: ${projectName} (${names.length} files): ${names.join(', ')}`,
  ];
  const active = files[activePath];
  if (active !== undefined) {
    const body = active.length > 4000 ? `${active.slice(0, 4000)}\n…(truncated)` : active;
    parts.push('', `Active file: ${activePath}`, '```', body, '```');
  }
  const rules = loadRules().trim();
  if (rules) parts.push('', `Project rules (always follow):\n${rules}`);
  const tools = connectorsPromptBlock();
  if (tools) parts.push('', tools);
  if (extra) parts.push('', extra);
  parts.push('', EDIT_PROTOCOL);
  return parts.join('\n');
}

export interface ChatTurn {
  reply: string;
  edits: ProposedEdit[];
}

/** One chat turn: history + prompt -> reply text + parsed file edits. */
export async function geminiTurn(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  prompt: string,
  opts: { model: string; projectName: string; files: FileMap; activePath: string; images?: Array<{ mime: string; base64: string }> },
): Promise<ChatTurn> {
  const key = getGeminiKey();
  if (!key) throw new Error('Add a Gemini API key to chat (account settings).');
  const ai = new GoogleGenAI({ apiKey: key });
  const imgParts = (opts.images ?? [])
    .filter((im) => im.base64)
    .map((im) => ({ inlineData: { mimeType: im.mime || 'image/jpeg', data: im.base64 } }));
  const contents = [
    ...history.map((m) => ({
      role: m.role === 'assistant' ? ('model' as const) : ('user' as const),
      parts: [{ text: m.content }],
    })),
    { role: 'user' as const, parts: [{ text: prompt }, ...imgParts] },
  ];
  const response = await ai.models.generateContent({
    model: opts.model,
    config: { systemInstruction: buildSystemPrompt(opts.projectName, opts.files, opts.activePath) },
    contents,
  });
  const reply = (response.text ?? '').trim();
  if (!reply) throw new Error('Empty reply from Gemini.');
  return { reply, edits: parseEdits(reply, opts.files) };
}

export { stripEditBlocks };
