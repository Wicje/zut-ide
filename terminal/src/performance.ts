// Frame budget for the terminal client.
//
// Every frame the WebView paints is encoded and written to the terminal over
// the kitty graphics protocol. The cost grows with both the frame rate and
// the number of pixels, so a 60fps stream on a big terminal or inside tmux
// can saturate the writer even when the app itself is idle. These knobs are
// the ones pixel exposes (PIXEL_FPS / PIXEL_MAX_PIXELS); we pick conservative
// defaults and let the user override them.

import type { PerformanceOptions, Quality } from './options.js';

const MIB = 1024 * 1024;

export interface PerformanceResult {
  /** Environment passed to the pixel child process. */
  env: Record<string, string | undefined>;
  quality: Quality;
  fps: number;
  maxPixels: number | null;
}

/**
 * Balanced unless the machine or the multiplexer is the weak link:
 * tmux passthrough is slower, and a 4GB laptop is the reference device.
 */
export function chooseQuality(
  opts: PerformanceOptions,
  env: Record<string, string | undefined>,
  totalMemBytes: number,
): Quality {
  if (opts.quality) return opts.quality;
  if (env.TMUX) return 'low';
  if (totalMemBytes > 0 && totalMemBytes < 6 * 1024 * MIB) return 'low';
  return 'balanced';
}

function defaultFps(quality: Quality): number {
  return quality === 'low' ? 24 : quality === 'high' ? 60 : 30;
}

function defaultMaxPixels(quality: Quality): number | null {
  return quality === 'low' ? 1_200_000 : quality === 'balanced' ? 2_000_000 : null;
}

/**
 * Explicit `PIXEL_*` variables always win; `--fps` / `--max-pixels` win over
 * the preset. Returns the values actually in force so the launcher can say so.
 */
export function performanceEnv(
  base: Record<string, string | undefined>,
  opts: PerformanceOptions,
  totalMemBytes: number,
): PerformanceResult {
  const env = { ...base };
  const quality = chooseQuality(opts, env, totalMemBytes);

  const envFps = Number(env.PIXEL_FPS);
  const fps =
    opts.fps ?? (Number.isFinite(envFps) && envFps > 0 ? envFps : defaultFps(quality));
  if (opts.fps != null || !Number.isFinite(envFps) || envFps <= 0) {
    env.PIXEL_FPS = String(fps);
  }

  // PIXEL_MAX_PIXELS=0 means "no cap", which is a meaningful user choice.
  const envMax = Number(env.PIXEL_MAX_PIXELS);
  const envMaxValid = env.PIXEL_MAX_PIXELS !== undefined && Number.isFinite(envMax) && envMax >= 0;
  const maxPixels = opts.maxPixels ?? (envMaxValid ? envMax : defaultMaxPixels(quality));
  if (opts.maxPixels != null) env.PIXEL_MAX_PIXELS = String(opts.maxPixels);
  else if (!envMaxValid && maxPixels != null) env.PIXEL_MAX_PIXELS = String(maxPixels);

  return {
    env,
    quality,
    fps,
    maxPixels: maxPixels === 0 ? null : maxPixels,
  };
}
