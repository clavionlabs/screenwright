import type { Page } from 'playwright';
import type { TimelineCollector } from './timeline-collector.js';
import type { ManifestEntry, TransitionMarker, SceneSlideConfig, TransitionType } from '../timeline/types.js';
import type { PregeneratedNarration } from './narration-preprocess.js';

export interface ActionOptions {
  narration?: string;
}

export interface SceneOptions {
  description?: string;
  slide?: SceneSlideConfig;
}

export interface TransitionOptions {
  type?: TransitionType;
  duration?: number;
}

export interface ScreenwrightHelpers {
  page: Page;
  scene(title: string, descriptionOrOptions?: string | SceneOptions): Promise<void>;
  navigate(url: string, opts?: ActionOptions): Promise<void>;
  click(selector: string, opts?: ActionOptions): Promise<void>;
  fill(selector: string, value: string, opts?: ActionOptions): Promise<void>;
  hover(selector: string, opts?: ActionOptions): Promise<void>;
  press(key: string, opts?: ActionOptions): Promise<void>;
  wait(ms: number): Promise<void>;
  narrate(text: string): Promise<void>;
  transition(opts?: TransitionOptions): Promise<void>;
}

export interface RecordingContext {
  pauseCapture(): Promise<void>;
  resumeCapture(): void;
  captureOneFrame(): Promise<string>;
  addHold(file: string, count: number): void;
  addTransitionMarker(marker: TransitionMarker): void;
  popNarration(): PregeneratedNarration;
  currentTimeMs(): number;
  readonly manifest: ManifestEntry[];
  transitionPending: boolean;
  readonly narrationCount: number;
}

const DEFAULT_SLIDE_DURATION_MS = 2000;
const CHAR_TYPE_DELAY_MS = 30;
const CURSOR_MOVE_MIN_MS = 200;
const CURSOR_MOVE_MAX_MS = 800;
const FPS = 30;

export function calculateMoveDuration(fromX: number, fromY: number, toX: number, toY: number): number {
  const distance = Math.sqrt((toX - fromX) ** 2 + (toY - fromY) ** 2);
  return Math.min(CURSOR_MOVE_MAX_MS, Math.max(CURSOR_MOVE_MIN_MS, Math.round(200 * Math.log2(distance / 10 + 1))));
}

function msToFrames(ms: number): number {
  return Math.ceil(ms / 1000 * FPS);
}

const SLIDE_OVERLAY_ID = '__screenwright_slide_overlay__';

function escapeJs(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
}

async function injectSlideOverlay(
  page: Page,
  title: string,
  description: string | undefined,
  config: SceneSlideConfig,
): Promise<void> {
  const brandColor = config.brandColor ?? '#000000';
  const textColor = config.textColor ?? '#FFFFFF';
  const fontFamily = config.fontFamily;
  const titleFontSize = config.titleFontSize ?? 64;
  const descFontSize = Math.round(titleFontSize * 0.44);
  const resolvedFont = fontFamily
    ? `"${fontFamily}", system-ui, -apple-system, sans-serif`
    : 'system-ui, -apple-system, sans-serif';

  // Use string-based evaluate to avoid TypeScript checking browser globals
  let script = '';
  if (fontFamily) {
    const encoded = encodeURIComponent(fontFamily);
    script += `
      if (!document.getElementById('${SLIDE_OVERLAY_ID}_font')) {
        var link = document.createElement('link');
        link.id = '${SLIDE_OVERLAY_ID}_font';
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=${encoded}&display=swap';
        document.head.appendChild(link);
      }
    `;
  }
  script += `
    var overlay = document.createElement('div');
    overlay.id = '${SLIDE_OVERLAY_ID}';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:center;background-color:${escapeJs(brandColor)};font-family:${escapeJs(resolvedFont)};';
    var inner = document.createElement('div');
    inner.style.cssText = 'text-align:center;padding:0 10%;';
    var h1 = document.createElement('h1');
    h1.textContent = '${escapeJs(title)}';
    h1.style.cssText = 'color:${escapeJs(textColor)};font-size:${titleFontSize}px;font-weight:700;margin:0;line-height:1.2;';
    inner.appendChild(h1);
  `;
  if (description) {
    script += `
      var divider = document.createElement('div');
      divider.style.cssText = 'width:80px;height:4px;background-color:${escapeJs(textColor)};opacity:0.4;margin:24px auto;border-radius:2px;';
      inner.appendChild(divider);
      var p = document.createElement('p');
      p.textContent = '${escapeJs(description)}';
      p.style.cssText = 'color:${escapeJs(textColor)};font-size:${descFontSize}px;font-weight:400;margin:0;opacity:0.85;line-height:1.5;';
      inner.appendChild(p);
    `;
  }
  script += `
    overlay.appendChild(inner);
    document.body.appendChild(overlay);
  `;
  await page.evaluate(script);

  // Wait for font to load if specified, with 3s timeout
  if (fontFamily) {
    await page.evaluate(`
      (async () => {
        try {
          await Promise.race([
            document.fonts.load('700 64px "${escapeJs(fontFamily)}"'),
            new Promise(r => setTimeout(r, 3000)),
          ]);
        } catch {}
      })()
    `).catch(() => {});
  }
}

async function removeSlideOverlay(page: Page): Promise<void> {
  await page.evaluate(`
    var el = document.getElementById('${SLIDE_OVERLAY_ID}');
    if (el) el.remove();
    var fontLink = document.getElementById('${SLIDE_OVERLAY_ID}_font');
    if (fontLink) fontLink.remove();
  `).catch(() => {});
}

export function createHelpers(page: Page, collector: TimelineCollector, ctx: RecordingContext): ScreenwrightHelpers {
  let lastX = 640;
  let lastY = 360;

  async function emitNarration(text: string): Promise<void> {
    await ctx.pauseCapture();
    const narration = ctx.popNarration();
    const file = await ctx.captureOneFrame();
    const holdFrames = msToFrames(narration.durationMs);
    if (holdFrames > 1) ctx.addHold(file, holdFrames - 1); // captureOneFrame already added 1
    collector.emit({
      type: 'narration',
      timestampMs: ctx.currentTimeMs(),
      text: narration.text,
      audioDurationMs: narration.durationMs,
      audioFile: narration.audioFile,
    });
    ctx.resumeCapture();
  }

  async function moveCursorTo(toX: number, toY: number): Promise<void> {
    const moveDurationMs = calculateMoveDuration(lastX, lastY, toX, toY);
    collector.emit({
      type: 'cursor_target',
      timestampMs: ctx.currentTimeMs(),
      fromX: lastX, fromY: lastY,
      toX, toY,
      moveDurationMs,
      easing: 'bezier' as const,
    });
    await page.waitForTimeout(moveDurationMs);
    lastX = toX;
    lastY = toY;
  }

  async function resolveCenter(selector: string): Promise<{ x: number; y: number }> {
    const locator = page.locator(selector).first();
    await locator.waitFor({ state: 'visible', timeout: 10000 });
    const box = await locator.boundingBox();
    if (!box) return { x: lastX, y: lastY };
    return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
  }

  function actionError(action: string, selector: string, cause: unknown): Error {
    const url = page.url();
    const msg = cause instanceof Error ? cause.message : String(cause);
    const err = new Error(
      `sw.${action}(${JSON.stringify(selector)}) failed on ${url}\n${msg}`,
    );
    err.cause = cause;
    return err;
  }

  /** Resolve a pending transition after an action settles. */
  async function resolveTransition(): Promise<void> {
    if (!ctx.transitionPending) return;
    const file = await ctx.captureOneFrame();
    // The "after" frame is now in the manifest — resume capture
    ctx.transitionPending = false;
    ctx.resumeCapture();
    // We don't need the file reference; it's in the manifest at the correct position
    void file;
  }

  return {
    page,

    async scene(title, descriptionOrOptions) {
      let description: string | undefined;
      let slide: SceneSlideConfig | undefined;

      if (typeof descriptionOrOptions === 'string') {
        description = descriptionOrOptions;
      } else if (descriptionOrOptions !== undefined) {
        description = descriptionOrOptions.description;
        slide = descriptionOrOptions.slide;
      }

      if (slide) {
        // DOM injection slide
        await ctx.pauseCapture();
        const slideDurationMs = slide.duration ?? DEFAULT_SLIDE_DURATION_MS;

        await injectSlideOverlay(page, title, description, slide);
        try {
          const file = await ctx.captureOneFrame();
          const holdFrames = msToFrames(slideDurationMs);
          if (holdFrames > 1) ctx.addHold(file, holdFrames - 1);
        } finally {
          await removeSlideOverlay(page);
        }

        collector.emit({ type: 'scene', timestampMs: ctx.currentTimeMs(), title, description, slide });

        // If transition was pending, the slide resolves it
        if (ctx.transitionPending) {
          ctx.transitionPending = false;
        }

        // Do NOT resume capture here — the slide is self-contained.
        // Resuming would capture blank-page frames that corrupt subsequent
        // transition markers.  The next real action resumes capture.
      } else {
        // No slide — just emit scene marker
        collector.emit({ type: 'scene', timestampMs: ctx.currentTimeMs(), title, description });
      }
    },

    async navigate(url, actionOpts) {
      if (actionOpts?.narration) await emitNarration(actionOpts.narration);

      const wasPending = ctx.transitionPending;
      if (wasPending) {
        // Capture loop is already paused from transition()
      }

      const startMs = ctx.currentTimeMs();
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        collector.emit({
          type: 'action',
          action: 'navigate',
          selector: url,
          durationMs: 0,
          boundingBox: null,
          timestampMs: startMs,
          settledAtMs: ctx.currentTimeMs(),
        });
      } catch (err) {
        throw actionError('navigate', url, err);
      }

      if (wasPending) {
        await resolveTransition();
      } else {
        ctx.resumeCapture();
      }
    },

    async click(selector, actionOpts) {
      if (actionOpts?.narration) await emitNarration(actionOpts.narration);

      const wasPending = ctx.transitionPending;

      try {
        const center = await resolveCenter(selector);
        await moveCursorTo(center.x, center.y);
        const locator = page.locator(selector).first();
        const box = await locator.boundingBox();
        const startMs = ctx.currentTimeMs();
        await locator.click();
        collector.emit({
          type: 'action',
          action: 'click',
          selector,
          durationMs: 200,
          boundingBox: box ? { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) } : null,
          timestampMs: startMs,
          settledAtMs: ctx.currentTimeMs(),
        });
      } catch (err) {
        throw actionError('click', selector, err);
      }

      if (wasPending) {
        await resolveTransition();
      } else {
        ctx.resumeCapture();
      }
    },

    async fill(selector, value, actionOpts) {
      if (actionOpts?.narration) await emitNarration(actionOpts.narration);

      const wasPending = ctx.transitionPending;

      try {
        const center = await resolveCenter(selector);
        await moveCursorTo(center.x, center.y);
        const locator = page.locator(selector).first();
        const box = await locator.boundingBox();
        await locator.click();
        const startMs = ctx.currentTimeMs();
        for (const char of value) {
          await page.keyboard.type(char, { delay: CHAR_TYPE_DELAY_MS });
        }
        collector.emit({
          type: 'action',
          action: 'fill',
          selector,
          value,
          durationMs: value.length * CHAR_TYPE_DELAY_MS,
          boundingBox: box ? { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) } : null,
          timestampMs: startMs,
          settledAtMs: ctx.currentTimeMs(),
        });
      } catch (err) {
        throw actionError('fill', selector, err);
      }

      if (wasPending) {
        await resolveTransition();
      } else {
        ctx.resumeCapture();
      }
    },

    async hover(selector, actionOpts) {
      if (actionOpts?.narration) await emitNarration(actionOpts.narration);

      const wasPending = ctx.transitionPending;

      try {
        const center = await resolveCenter(selector);
        await moveCursorTo(center.x, center.y);
        const locator = page.locator(selector).first();
        const box = await locator.boundingBox();
        const startMs = ctx.currentTimeMs();
        await locator.hover();
        collector.emit({
          type: 'action',
          action: 'hover',
          selector,
          durationMs: 200,
          boundingBox: box ? { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) } : null,
          timestampMs: startMs,
          settledAtMs: ctx.currentTimeMs(),
        });
      } catch (err) {
        throw actionError('hover', selector, err);
      }

      if (wasPending) {
        await resolveTransition();
      } else {
        ctx.resumeCapture();
      }
    },

    async press(key, actionOpts) {
      if (actionOpts?.narration) await emitNarration(actionOpts.narration);

      const wasPending = ctx.transitionPending;

      const startMs = ctx.currentTimeMs();
      try {
        await page.keyboard.press(key);
        collector.emit({
          type: 'action',
          action: 'press',
          selector: key,
          durationMs: 100,
          boundingBox: null,
          timestampMs: startMs,
          settledAtMs: ctx.currentTimeMs(),
        });
      } catch (err) {
        throw actionError('press', key, err);
      }

      if (wasPending) {
        await resolveTransition();
      } else {
        ctx.resumeCapture();
      }
    },

    async wait(ms) {
      if (ctx.transitionPending) {
        // Capture loop is already paused. Wait for real settling, then hold.
        await page.waitForTimeout(ms);
        const file = await ctx.captureOneFrame();
        const holdFrames = msToFrames(ms);
        if (holdFrames > 1) ctx.addHold(file, holdFrames - 1);
        collector.emit({ type: 'wait', timestampMs: ctx.currentTimeMs(), durationMs: ms, reason: 'pacing' as const });
      } else {
        // Ensure capture is running — captures real frames during the wait
        ctx.resumeCapture();
        collector.emit({ type: 'wait', timestampMs: ctx.currentTimeMs(), durationMs: ms, reason: 'pacing' as const });
        await page.waitForTimeout(ms);
      }
    },

    async narrate(text) {
      await emitNarration(text);
    },

    async transition(transitionOpts) {
      const durationMs = transitionOpts?.duration ?? 500;
      if (durationMs <= 0 || !Number.isFinite(durationMs)) {
        throw new Error(`sw.transition() duration must be a positive number, got ${durationMs}`);
      }

      if (ctx.transitionPending) {
        console.warn('sw.transition() called twice with no action between them — replacing previous transition marker.');
        // Remove the last marker
        const markers = (ctx as any)._transitionMarkers;
        if (markers && markers.length > 0) markers.pop();
      }

      await ctx.pauseCapture();
      ctx.addTransitionMarker({
        afterEntryIndex: ctx.manifest.length - 1,
        transition: transitionOpts?.type ?? 'fade',
        durationFrames: msToFrames(durationMs),
      });
      ctx.transitionPending = true;
      // Capture loop stays paused — next resolving action will resume it
    },
  };
}
