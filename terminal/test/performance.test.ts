import { describe, expect, it } from 'vitest';
import { chooseQuality, performanceEnv } from '../src/performance.js';

const GB = 1024 * 1024 * 1024;
const opts = { fps: null, maxPixels: null, quality: null };

describe('chooseQuality', () => {
  it('defaults to balanced on a normal machine', () => {
    expect(chooseQuality(opts, {}, 16 * GB)).toBe('balanced');
  });

  it('drops to low inside tmux or on a small machine', () => {
    expect(chooseQuality(opts, { TMUX: '/tmp/tmux' }, 16 * GB)).toBe('low');
    expect(chooseQuality(opts, {}, 4 * GB)).toBe('low');
  });

  it('lets an explicit choice win', () => {
    expect(chooseQuality({ ...opts, quality: 'high' }, { TMUX: '/tmp/tmux' }, 2 * GB)).toBe('high');
  });
});

describe('performanceEnv', () => {
  it('sets a frame rate and pixel cap by preset', () => {
    const low = performanceEnv({}, opts, 4 * GB);
    expect(low.quality).toBe('low');
    expect(low.fps).toBe(24);
    expect(low.maxPixels).toBe(1_200_000);
    expect(low.env.PIXEL_FPS).toBe('24');
    expect(low.env.PIXEL_MAX_PIXELS).toBe('1200000');

    const high = performanceEnv({}, { ...opts, quality: 'high' }, 16 * GB);
    expect(high.fps).toBe(60);
    expect(high.maxPixels).toBeNull();
    expect(high.env.PIXEL_MAX_PIXELS).toBeUndefined();
  });

  it('honours explicit flags over the preset', () => {
    const r = performanceEnv({}, { ...opts, quality: 'low', fps: 45, maxPixels: 900_000 }, 4 * GB);
    expect(r.fps).toBe(45);
    expect(r.maxPixels).toBe(900_000);
    expect(r.env.PIXEL_FPS).toBe('45');
    expect(r.env.PIXEL_MAX_PIXELS).toBe('900000');
  });

  it('never overrides the environment', () => {
    const r = performanceEnv({ PIXEL_FPS: '15', PIXEL_MAX_PIXELS: '800000' }, opts, 16 * GB);
    expect(r.env.PIXEL_FPS).toBe('15');
    expect(r.env.PIXEL_MAX_PIXELS).toBe('800000');
    expect(r.fps).toBe(15);
  });
});
