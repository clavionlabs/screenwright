import { chromium } from 'playwright';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Timeline, FrameEntry } from '../timeline/types.js';
import { TimelineCollector } from './timeline-collector.js';
import { createHelpers, type ScreenwrightHelpers } from './action-helpers.js';

export type ScenarioFn = (sw: ScreenwrightHelpers) => Promise<void>;

export interface RunOptions {
  scenarioFile: string;
  testFile: string;
  viewport?: { width: number; height: number };
  colorScheme?: 'light' | 'dark';
  locale?: string;
  timezoneId?: string;
  captureMode?: 'frames' | 'video';
}

export interface RunResult {
  timeline: Timeline;
  videoFile?: string;
  tempDir: string;
}

export async function runScenario(scenario: ScenarioFn, opts: RunOptions): Promise<RunResult> {
  const viewport = opts.viewport ?? { width: 1280, height: 720 };
  const DPR = 2;
  const tempDir = await mkdtemp(join(tmpdir(), 'screenwright-'));
  const captureMode = opts.captureMode ?? 'frames';

  const browser = await chromium.launch({
    args: ['--disable-gpu', '--font-render-hinting=none', '--disable-lcd-text'],
  });

  const contextOpts: Record<string, unknown> = {
    viewport,
    deviceScaleFactor: DPR,
    colorScheme: opts.colorScheme ?? 'light',
    locale: opts.locale ?? 'en-US',
    timezoneId: opts.timezoneId ?? 'America/New_York',
  };

  if (captureMode === 'video') {
    contextOpts.recordVideo = { dir: tempDir, size: viewport };
  }

  const context = await browser.newContext(contextOpts);

  // Hide the native cursor so only the Screenwright overlay cursor appears
  await context.addInitScript(`
    const s = document.createElement('style');
    s.textContent = '*, *::before, *::after { cursor: none !important; }';
    (document.head || document.documentElement).appendChild(s);
  `);

  const page = await context.newPage();
  const collector = new TimelineCollector();
  let frameManifest: FrameEntry[] | undefined;
  let captureTimer: ReturnType<typeof setInterval> | undefined;
  let frameCounter = 0;
  let capturing = false;

  if (captureMode === 'frames') {
    const framesDir = join(tempDir, 'frames');
    await mkdir(framesDir, { recursive: true });
    frameManifest = [];

    // Use page.screenshot() which captures at deviceScaleFactor resolution.
    // CDP screencast ignores DPR — screenshots are the only reliable way to
    // get true 2× frames.
    captureTimer = setInterval(() => {
      if (capturing) return;
      capturing = true;
      (async () => {
        try {
          frameCounter++;
          const filename = `frame-${String(frameCounter).padStart(6, '0')}.jpg`;
          const filePath = join(framesDir, filename);
          await page.screenshot({ path: filePath, type: 'jpeg', quality: 95 });
          frameManifest!.push({
            timestampMs: collector.elapsed(),
            file: `frames/${filename}`,
          });
        } catch {
          // Page may not be ready or is closing
        }
        capturing = false;
      })();
    }, 100);
  }

  collector.start();

  const sw = createHelpers(page, collector);

  let videoFile: string | undefined;
  try {
    await scenario(sw);

    // Stop frame capture and take one final screenshot
    if (captureTimer) {
      clearInterval(captureTimer);
      try {
        frameCounter++;
        const filename = `frame-${String(frameCounter).padStart(6, '0')}.jpg`;
        const filePath = join(join(tempDir, 'frames'), filename);
        await page.screenshot({ path: filePath, type: 'jpeg', quality: 95 });
        frameManifest!.push({
          timestampMs: collector.elapsed(),
          file: `frames/${filename}`,
        });
      } catch {
        // Page may already be closing
      }
    }

    // Close page to finalize video
    await page.close();

    if (captureMode === 'video') {
      const video = page.video();
      videoFile = video ? await video.path() : undefined;
    }
  } finally {
    if (captureTimer) clearInterval(captureTimer);
    // Ensure browser resources are always cleaned up (idempotent if already closed)
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  const videoDurationMs = collector.getEvents().reduce((max, e) => {
    const ts = e.timestampMs + ('durationMs' in e ? (e.durationMs ?? 0) : 0);
    return Math.max(max, ts);
  }, 0);

  const timeline = collector.finalize({
    testFile: opts.testFile,
    scenarioFile: opts.scenarioFile,
    recordedAt: new Date().toISOString(),
    viewport,
    videoDurationMs,
    videoFile,
    frameManifest,
  });

  const timelinePath = join(tempDir, 'timeline.json');
  await writeFile(timelinePath, JSON.stringify(timeline, null, 2));

  return { timeline, videoFile, tempDir };
}
