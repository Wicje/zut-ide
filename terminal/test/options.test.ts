import { describe, expect, it } from 'vitest';
import { DEFAULT_PORT, UsageError, parseArgs, withTerminalFlag } from '../src/options.js';

describe('parseArgs', () => {
  it('defaults to a preview server on the default port', () => {
    expect(parseArgs([])).toEqual({
      url: null,
      port: DEFAULT_PORT,
      mode: 'preview',
      rebuild: false,
      fps: null,
      maxPixels: null,
      quality: null,
      help: false,
    });
  });

  it('reads --url in both spellings', () => {
    expect(parseArgs(['--url', 'http://127.0.0.1:9000/']).url).toBe('http://127.0.0.1:9000/');
    expect(parseArgs(['--url=http://127.0.0.1:9000/']).url).toBe('http://127.0.0.1:9000/');
  });

  it('treats a bare argument as the url', () => {
    expect(parseArgs(['https://zut.example']).url).toBe('https://zut.example');
  });

  it('reads --port in both spellings', () => {
    expect(parseArgs(['--port', '5100']).port).toBe(5100);
    expect(parseArgs(['--port=5100']).port).toBe(5100);
  });

  it('rejects a port that is not a port', () => {
    expect(() => parseArgs(['--port', 'nope'])).toThrow(UsageError);
    expect(() => parseArgs(['--port', '70000'])).toThrow(UsageError);
    expect(() => parseArgs(['--port'])).toThrow(UsageError);
  });

  it('rejects a url without a scheme', () => {
    expect(() => parseArgs(['--url', '127.0.0.1:9000'])).toThrow(UsageError);
    expect(() => parseArgs(['--url'])).toThrow(UsageError);
  });

  it('rejects unknown options instead of ignoring them', () => {
    expect(() => parseArgs(['--nope'])).toThrow(UsageError);
  });

  it('switches modes', () => {
    expect(parseArgs(['--dev']).mode).toBe('dev');
    expect(parseArgs(['--rebuild']).rebuild).toBe(true);
    expect(parseArgs(['-h']).help).toBe(true);
    expect(parseArgs(['--help']).help).toBe(true);
  });

  it('keeps the first bare url and ignores later positionals', () => {
    expect(parseArgs(['http://a.example', 'http://b.example']).url).toBe('http://a.example');
  });

  it('reads the frame budget knobs', () => {
    expect(parseArgs(['--fps', '30']).fps).toBe(30);
    expect(parseArgs(['--fps=30']).fps).toBe(30);
    expect(parseArgs(['--max-pixels', '1500000']).maxPixels).toBe(1_500_000);
    expect(parseArgs(['--max-pixels=1500000']).maxPixels).toBe(1_500_000);
    expect(parseArgs(['--quality', 'low']).quality).toBe('low');
    expect(parseArgs(['--quality=high']).quality).toBe('high');
  });

  it('rejects impossible frame budgets', () => {
    expect(() => parseArgs(['--fps', '0'])).toThrow(UsageError);
    expect(() => parseArgs(['--fps', '500'])).toThrow(UsageError);
    expect(() => parseArgs(['--max-pixels', '1'])).toThrow(UsageError);
    expect(() => parseArgs(['--quality', 'ultra'])).toThrow(UsageError);
  });
});

describe('withTerminalFlag', () => {
  it('adds the terminal marker once', () => {
    expect(withTerminalFlag('http://127.0.0.1:4173/')).toBe('http://127.0.0.1:4173/?terminal=1');
    expect(withTerminalFlag('https://zut.example/app')).toBe('https://zut.example/app?terminal=1');
  });

  it('keeps an existing query and does not duplicate the marker', () => {
    const marked = withTerminalFlag('https://zut.example/app?foo=1&terminal=1');
    expect(marked).toBe('https://zut.example/app?foo=1&terminal=1');
  });
});
