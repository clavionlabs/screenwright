import { chromium } from 'playwright';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { TimelineCollector } from './timeline-collector.js';
import { createHelpers, setFps } from './action-helpers.js';
let FRAME_INTERVAL_MS = 1000 / 16;
// DPR=1 during capture — Remotion applies scale:2 at render time for final quality.
// This cuts screenshot size from ~6MP to ~1.5MP, dramatically improving capture speed.
const DPR = 1;
function sleep(ms) {
    return new Promise(r => setTimeout(r, Math.max(0, ms)));
}
export async function runScenario(scenario, opts) {
    const viewport = opts.viewport ?? { width: 1280, height: 720 };
    const fps = opts.fps ?? 16;
    FRAME_INTERVAL_MS = 1000 / fps;
    setFps(fps);
    // Use caller-provided outputDir if available, otherwise fall back to OS temp
    const tempDir = opts.outputDir ?? await mkdtemp(join(tmpdir(), 'screenwright-'));
    await mkdir(tempDir, { recursive: true });
    const framesDir = join(tempDir, 'frames');
    await mkdir(framesDir, { recursive: true });
    const browser = await chromium.launch({
        args: [
            '--font-render-hinting=none',
            '--disable-lcd-text',
            '--enable-gpu-rasterization',
            '--enable-zero-copy',
            '--ignore-gpu-blocklist',
        ],
    });
    const context = await browser.newContext({
        viewport,
        deviceScaleFactor: DPR,
        bypassCSP: true,
        colorScheme: opts.colorScheme ?? 'light',
        locale: opts.locale ?? 'en-US',
        timezoneId: opts.timezoneId ?? 'America/New_York',
    });
    // Hide the native cursor so only the Screenwright overlay cursor appears.
    await context.addInitScript(`
    const s = document.createElement('style');
    s.textContent = '*, *::before, *::after { cursor: none !important; }';
    (document.head || document.documentElement).appendChild(s);
  `);
    const page = await context.newPage();
    const collector = new TimelineCollector();
    const manifest = [];
    const transitionMarkers = [];
    // Narration queue from pre-generated audio
    const narrationQueue = opts.pregenerated ? [...opts.pregenerated] : [];
    let narrationConsumed = 0;
    // Virtual clock: each frame = exactly 1000/fps ms
    let virtualFrameIndex = 0;
    let frameFileCounter = 0;
    let transitionFrameCounter = 0;
    // Capture loop state
    let captureRunning = false;
    let pendingScreenshot = Promise.resolve();
    // Capture loop instrumentation
    const screenshotTimings = [];
    let captureLoopStart = 0;
    let captureFailures = 0;
    // Frame deduplication: skip disk writes for identical consecutive frames.
    // During wait periods the screen is static — this saves significant I/O.
    let pendingWrite = Promise.resolve();
    let lastFrameHash = '';
    let lastFrameFile = '';
    let dedupedFrames = 0;
    async function runCaptureLoop() {
        captureRunning = true;
        if (!captureLoopStart)
            captureLoopStart = performance.now();
        while (captureRunning) {
            const start = performance.now();
            try {
                // Capture to buffer
                const buf = await page.screenshot({ type: 'jpeg', quality: 75 });
                // Fast hash to detect duplicate frames
                const hash = createHash('md5').update(buf).digest('hex');
                if (hash === lastFrameHash && lastFrameFile) {
                    // Screen unchanged — reuse previous frame file (no disk write)
                    manifest.push({ type: 'frame', file: lastFrameFile });
                    dedupedFrames++;
                } else {
                    // New frame — write to disk
                    frameFileCounter++;
                    const filename = `frame-${String(frameFileCounter).padStart(6, '0')}.jpg`;
                    await pendingWrite;
                    pendingWrite = writeFile(join(framesDir, filename), buf);
                    lastFrameFile = `frames/${filename}`;
                    lastFrameHash = hash;
                    manifest.push({ type: 'frame', file: lastFrameFile });
                }
                virtualFrameIndex++;
                screenshotTimings.push(performance.now() - start);
            }
            catch {
                captureFailures++;
            }
            const elapsed = performance.now() - start;
            await sleep(FRAME_INTERVAL_MS - elapsed);
        }
        await pendingWrite; // flush last write
    }
    async function pauseCapture() {
        captureRunning = false;
        await pendingScreenshot;
    }
    function resumeCapture() {
        if (!captureRunning) {
            pendingScreenshot = runCaptureLoop();
        }
    }
    /** Explicit screenshot for transition images — not in the manifest, no virtual clock advance. */
    async function captureTransitionFrame() {
        transitionFrameCounter++;
        const filename = `transition-${String(transitionFrameCounter).padStart(4, '0')}.jpg`;
        const buf = await page.screenshot({ type: 'jpeg', quality: 75 });
        await writeFile(join(framesDir, filename), buf);
        return `frames/${filename}`;
    }
    function addTransitionMarker(marker) {
        transitionMarkers.push(marker);
    }
    function popNarration() {
        if (narrationQueue.length === 0) {
            throw new Error('No pre-generated narrations remaining in queue');
        }
        narrationConsumed++;
        return narrationQueue.shift();
    }
    function currentTimeMs() {
        return virtualFrameIndex * FRAME_INTERVAL_MS;
    }
    function ensureCaptureStarted() {
        if (!captureRunning)
            resumeCapture();
    }
    /**
     * Wait until the video has advanced by the given duration (in ms).
     * Counts frames instead of wall-clock time — eliminates FPS drift.
     */
    async function waitForDuration(ms) {
        const framesNeeded = Math.ceil(ms / FRAME_INTERVAL_MS);
        const targetFrame = virtualFrameIndex + framesNeeded;
        while (virtualFrameIndex < targetFrame) {
            await new Promise(r => setTimeout(r, 5));
        }
    }
    const ctx = {
        captureTransitionFrame,
        addTransitionMarker,
        popNarration,
        currentTimeMs,
        ensureCaptureStarted,
        waitForDuration,
        get manifest() { return manifest; },
        transitionPending: false,
    };
    const sw = createHelpers(page, collector, ctx, opts.branding);
    try {
        await scenario(sw);
        // Stop capture loop and flush
        await pauseCapture();
        // Take one final frame
        try {
            frameFileCounter++;
            const filename = `frame-${String(frameFileCounter).padStart(6, '0')}.jpg`;
            const buf = await page.screenshot({ type: 'jpeg', quality: 75 });
            await writeFile(join(framesDir, filename), buf);
            manifest.push({ type: 'frame', file: `frames/${filename}` });
            virtualFrameIndex++;
        }
        catch {
            // Page may already be closing
        }
        // Capture loop stats + drift detection
        if (screenshotTimings.length > 0) {
            const wallMs = performance.now() - captureLoopStart;
            const actualFps = screenshotTimings.length / wallMs * 1000;
            const targetFps = 1000 / FRAME_INTERVAL_MS;
            const driftThreshold = 0.85; // warn if actual < 85% of target
            if (actualFps < targetFps * driftThreshold) {
                const suggestedFps = Math.floor(actualFps);
                console.warn(`\n⚠ Capture loop averaged ${actualFps.toFixed(1)}fps (target ${targetFps}fps). ` +
                    `Video timing may be inaccurate.\n` +
                    `  Consider setting fps: ${suggestedFps} in your screenwright config, ` +
                    `or running on a faster machine.\n`);
            }
        }
        // Warn about trailing transition
        if (ctx.transitionPending) {
            console.warn('sw.transition() at end of scenario with no following content — discarding marker.');
            transitionMarkers.pop();
            ctx.transitionPending = false;
        }
    }
    finally {
        await page.close().catch(() => { });
        await context.close().catch(() => { });
        await browser.close().catch(() => { });
    }
    const timeline = collector.finalize({
        testFile: opts.testFile,
        scenarioFile: opts.scenarioFile,
        recordedAt: new Date().toISOString(),
        viewport,
        fps,
        frameManifest: manifest,
        transitionMarkers,
    });
    const timelinePath = join(tempDir, 'timeline.json');
    await writeFile(timelinePath, JSON.stringify(timeline, null, 2));
    return { timeline, tempDir, narrationCount: narrationConsumed, dedupedFrames, uniqueFrames: frameFileCounter };
}
