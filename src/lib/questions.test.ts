import { describe, expect, it } from 'vitest';
import { answersPrompt, parseQuestions } from './questions';

describe('parseQuestions', () => {
  it('reads a question and its options', () => {
    const reply = [
      'I need one decision before I build this.',
      '',
      '[questions]',
      'How should the panel open?',
      '1. Gesture (swipe up with three fingers)',
      '2. Keyboard shortcut',
      '3. Both',
      '[/questions]',
    ].join('\n');
    const q = parseQuestions(reply);
    expect(q?.question).toBe('How should the panel open?');
    expect(q?.options).toEqual([
      'Gesture (swipe up with three fingers)',
      'Keyboard shortcut',
      'Both',
    ]);
  });

  it('is null when the agent did not ask anything', () => {
    expect(parseQuestions('All done — I changed two files.')).toBeNull();
    expect(parseQuestions('')).toBeNull();
  });

  it('is null when the block has no options', () => {
    expect(parseQuestions('[questions]\nJust a question?\n[/questions]')).toBeNull();
  });
});

describe('answersPrompt', () => {
  const q = { question: 'Which one?', options: ['A', 'B'] };

  it('sends the chosen option back', () => {
    expect(answersPrompt(q, 1)).toBe('Question: Which one?\nAnswer: B');
  });

  it('tells the agent to decide when skipped', () => {
    expect(answersPrompt(q, null)).toContain('Skip');
  });
});
