import { describe, expect, it } from 'vitest';
import { DEFAULT_PORT, UsageError, parseArgs } from '../src/options.js';

describe('parseArgs', () => {
  it('defaults to a preview server on the default port', () => {
    expect(parseArgs([])).toEqual({
      url: null,
      port: DEFAULT_PORT,
      mode: 'preview',
      rebuild: false,
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
});
