import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { resolve, basename } from 'node:path';
import { cpus } from 'node:os';
import { totalOutputFrames } from './frame-resolve.js';

const CHROME_HEIGHT = 72;

/**
 * Rewrite absolute file paths in the timeline to basenames.
 */
function toStaticPaths(timeline) {
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
export async function renderDemoVideo(opts) {
    const entryPoint = opts.entryPoint ?? resolve(import.meta.dirname, 'remotion-root.js');

    opts.onPhase?.('bundling');

    const bundlePath = await bundle({
        entryPoint,
        publicDir: opts.publicDir,
    });

    opts.onPhase?.('selecting');

    const staticTimeline = toStaticPaths(opts.timeline);
    const inputProps = { timeline: staticTimeline };
    if (opts.branding) {
        inputProps.branding = opts.branding;
    }

    // Compute composition dimensions directly — don't rely on calculateMetadata
    // (Remotion's webpack bundler can silently fail to execute calculateMetadata)
    const meta = opts.timeline.metadata;
    const fps = meta.fps ?? 11;
    const width = meta.viewport.width;
    const height = meta.viewport.height + CHROME_HEIGHT;
    const durationInFrames = Math.max(30, totalOutputFrames(meta.frameManifest, meta.transitionMarkers));

    const composition = await selectComposition({
        serveUrl: bundlePath,
        id: 'DemoVideo',
        inputProps,
    });

    // Override composition with correct values computed from timeline
    composition.fps = fps;
    composition.width = width;
    composition.height = height;
    composition.durationInFrames = durationInFrames;

    opts.onPhase?.('rendering');

    const cores = cpus().length;
    const concurrency = Math.max(2, Math.floor(cores * 0.75));

    await renderMedia({
        composition,
        serveUrl: bundlePath,
        codec: 'h264',
        crf: 18,
        pixelFormat: 'yuv420p',
        scale: 2,
        outputLocation: opts.outputPath,
        inputProps,
        concurrency,
        onProgress: (p) => {
            opts.onProgress?.(p);
        },
    });
    return opts.outputPath;
}
