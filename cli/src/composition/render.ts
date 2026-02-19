import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { resolve, basename } from 'node:path';
import type { Timeline } from '../timeline/types.js';
import type { BrandingConfig } from '../config/config-schema.js';

export interface RenderOptions {
  timeline: Timeline;
  outputPath: string;
  publicDir: string;
  entryPoint?: string;
  branding?: BrandingConfig;
}

/**
 * Rewrite absolute file paths in the timeline to basenames.
 * Remotion components run in a browser (webpack) and resolve assets
 * via staticFile() against the publicDir — they only need filenames.
 *
 * frameManifest paths are already relative to publicDir — no rewrite needed.
 */
function toStaticPaths(timeline: Timeline): Timeline {
  return {
    ...timeline,
    events: timeline.events.map(e => {
      if (e.type === 'narration' && e.audioFile) {
        return { ...e, audioFile: basename(e.audioFile) };
      }
      return e;
    }),
  };
}

export async function renderDemoVideo(opts: RenderOptions): Promise<string> {
  const entryPoint = opts.entryPoint ?? resolve(import.meta.dirname, 'remotion-root.js');

  const bundlePath = await bundle({
    entryPoint,
    publicDir: opts.publicDir,
  });

  const staticTimeline = toStaticPaths(opts.timeline);

  const inputProps: Record<string, unknown> = { timeline: staticTimeline };
  if (opts.branding) {
    inputProps.branding = opts.branding;
  }

  const composition = await selectComposition({
    serveUrl: bundlePath,
    id: 'DemoVideo',
    inputProps,
  });

  await renderMedia({
    composition,
    serveUrl: bundlePath,
    codec: 'h264',
    crf: 16,
    pixelFormat: 'yuv420p',
    scale: 2,
    outputLocation: opts.outputPath,
    inputProps,
  });

  return opts.outputPath;
}
