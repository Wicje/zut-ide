import { describe, expect, it } from 'vitest';
import {
  GRAPHICS_TERMINALS,
  isReachable,
  unreachableMessage,
  unsupportedMessage,
} from '../src/capabilities.js';

describe('isReachable', () => {
  it('is true when the URL answers', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => new Response('ok', { status: 200 })) as typeof fetch;
    try {
      expect(await isReachable('http://127.0.0.1:5173/')).toBe(true);
    } finally {
      globalThis.fetch = original;
    }
  });

  it('is false when nothing is listening', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;
    try {
      expect(await isReachable('http://127.0.0.1:59999/')).toBe(false);
    } finally {
      globalThis.fetch = original;
    }
  });
});

describe('messages', () => {
  it('names the URL and how to start the IDE', () => {
    const message = unreachableMessage('http://127.0.0.1:5173/');
    expect(message).toContain('http://127.0.0.1:5173/');
    expect(message).toContain('npm run dev');
  });

  it('names the terminals that can draw the IDE', () => {
    const message = unsupportedMessage();
    expect(message).toContain('kitty');
    expect(message).toContain('tmux');
    expect(GRAPHICS_TERMINALS).toContain('ghostty');
  });
});
