import { describe, expect, it } from 'vitest';
import { cleanCompletion } from './inlineComplete';

describe('cleanCompletion', () => {
  it('keeps a plain completion', () => {
    expect(cleanCompletion('const x = 1;')).toBe('const x = 1;');
  });

  it('unwraps a markdown fence', () => {
    expect(cleanCompletion('```ts\nconst x = 1;\n```')).toBe('const x = 1;');
  });

  it('unwraps a fence without a language', () => {
    expect(cleanCompletion('```\nreturn 42;\n```')).toBe('return 42;');
  });

  it('trims the edges', () => {
    expect(cleanCompletion('\n  const y = 2;  \n')).toBe('const y = 2;');
  });
});
