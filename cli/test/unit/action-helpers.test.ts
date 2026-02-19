import { describe, it, expect, vi } from 'vitest';
import { calculateMoveDuration, createHelpers, type RecordingContext } from '../../src/runtime/action-helpers.js';
import { TimelineCollector } from '../../src/runtime/timeline-collector.js';
import type { ManifestEntry, TransitionMarker } from '../../src/timeline/types.js';

function mockPage() {
  const locator = {
    waitFor: vi.fn().mockResolvedValue(undefined),
    boundingBox: vi.fn().mockResolvedValue({ x: 100, y: 200, width: 120, height: 40 }),
    click: vi.fn().mockResolvedValue(undefined),
    hover: vi.fn().mockResolvedValue(undefined),
  };
  return {
    goto: vi.fn().mockResolvedValue(undefined),
    waitForTimeout: vi.fn().mockResolvedValue(undefined),
    keyboard: {
      type: vi.fn().mockResolvedValue(undefined),
      press: vi.fn().mockResolvedValue(undefined),
    },
    locator: vi.fn().mockReturnValue({ first: () => locator }),
    evaluate: vi.fn().mockResolvedValue(undefined),
    url: vi.fn().mockReturnValue('http://localhost:3000'),
    _locator: locator,
  } as any;
}

function mockRecordingContext(narrations: { text: string; audioFile: string; durationMs: number }[] = []): RecordingContext {
  const manifest: ManifestEntry[] = [];
  const markers: TransitionMarker[] = [];
  let virtualFrameIndex = 0;
  let narrationIdx = 0;

  const ctx: RecordingContext = {
    pauseCapture: vi.fn().mockResolvedValue(undefined),
    resumeCapture: vi.fn(),
    captureOneFrame: vi.fn().mockImplementation(async () => {
      const file = `frames/frame-${String(manifest.length + 1).padStart(6, '0')}.jpg`;
      manifest.push({ type: 'frame', file });
      virtualFrameIndex++;
      return file;
    }),
    addHold: vi.fn().mockImplementation((file: string, count: number) => {
      manifest.push({ type: 'hold', file, count });
      virtualFrameIndex += count;
    }),
    addTransitionMarker: vi.fn().mockImplementation((marker: TransitionMarker) => {
      markers.push(marker);
    }),
    popNarration: vi.fn().mockImplementation(() => {
      if (narrationIdx >= narrations.length) throw new Error('No narrations');
      return narrations[narrationIdx++];
    }),
    currentTimeMs: vi.fn().mockImplementation(() => virtualFrameIndex * (1000 / 30)),
    get manifest() { return manifest; },
    transitionPending: false,
    get narrationCount() { return narrationIdx; },
  };
  (ctx as any)._transitionMarkers = markers;
  return ctx;
}

describe('calculateMoveDuration', () => {
  it('returns minimum 200ms for short distances', () => {
    expect(calculateMoveDuration(0, 0, 5, 5)).toBe(200);
  });

  it('returns maximum 800ms for very long distances', () => {
    expect(calculateMoveDuration(0, 0, 5000, 5000)).toBe(800);
  });

  it('scales with distance', () => {
    const short = calculateMoveDuration(0, 0, 50, 50);
    const long = calculateMoveDuration(0, 0, 500, 500);
    expect(long).toBeGreaterThan(short);
  });
});

describe('createHelpers', () => {
  it('scene() without slide emits scene event only', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    const ctx = mockRecordingContext();
    const sw = createHelpers(page, collector, ctx);

    await sw.scene('Intro');
    const events = collector.getEvents();

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('scene');
    const ev = events[0] as any;
    expect(ev.title).toBe('Intro');
    expect(ctx.pauseCapture).not.toHaveBeenCalled();
  });

  it('scene() with string description emits scene event', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    const ctx = mockRecordingContext();
    const sw = createHelpers(page, collector, ctx);

    await sw.scene('Intro', 'The beginning');
    const events = collector.getEvents();

    expect(events).toHaveLength(1);
    const ev = events[0] as any;
    expect(ev.title).toBe('Intro');
    expect(ev.description).toBe('The beginning');
  });

  it('scene() with slide pauses capture and injects DOM overlay', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    const ctx = mockRecordingContext();
    const sw = createHelpers(page, collector, ctx);

    await sw.scene('Intro', { slide: { brandColor: '#4F46E5' } });

    expect(ctx.pauseCapture).toHaveBeenCalled();
    expect(ctx.captureOneFrame).toHaveBeenCalled();
    // Scene with slide does NOT resume capture — next action does
    expect(ctx.resumeCapture).not.toHaveBeenCalled();
    // DOM injection via page.evaluate
    expect(page.evaluate).toHaveBeenCalled();
  });

  it('scene() with slide adds hold for duration', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    const ctx = mockRecordingContext();
    const sw = createHelpers(page, collector, ctx);

    await sw.scene('Intro', { slide: { duration: 3000 } });

    // 3000ms at 30fps = 90 frames. captureOneFrame adds 1, hold adds 89.
    expect(ctx.addHold).toHaveBeenCalled();
    const holdCall = (ctx.addHold as any).mock.calls[0];
    expect(holdCall[1]).toBe(89); // 90 - 1 = 89
  });

  it('click() emits cursor_target then action events', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    const ctx = mockRecordingContext();
    const sw = createHelpers(page, collector, ctx);

    await sw.click('.btn');
    const events = collector.getEvents();

    const types = events.map(e => e.type);
    expect(types).toContain('cursor_target');
    expect(types).toContain('action');
    expect(types.indexOf('cursor_target')).toBeLessThan(types.indexOf('action'));
  });

  it('click() with narration emits narration first', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    const ctx = mockRecordingContext([
      { text: 'Click the button', audioFile: '/tmp/n0.wav', durationMs: 1000 },
    ]);
    const sw = createHelpers(page, collector, ctx);

    await sw.click('.btn', { narration: 'Click the button' });
    const events = collector.getEvents();
    const types = events.map(e => e.type);

    expect(types[0]).toBe('narration');
    expect(types).toContain('cursor_target');
    expect(types).toContain('action');
  });

  it('fill() types characters with fixed delay', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    const ctx = mockRecordingContext();
    const sw = createHelpers(page, collector, ctx);

    await sw.fill('.input', 'abc');
    expect(page.keyboard.type).toHaveBeenCalledTimes(3);
    expect(page.keyboard.type).toHaveBeenCalledWith('a', { delay: 30 });
    expect(page.keyboard.type).toHaveBeenCalledWith('b', { delay: 30 });
    expect(page.keyboard.type).toHaveBeenCalledWith('c', { delay: 30 });
  });

  it('navigate() emits action event', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    const ctx = mockRecordingContext();
    const sw = createHelpers(page, collector, ctx);

    await sw.navigate('http://localhost:3000');
    const events = collector.getEvents();

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('action');
    expect((events[0] as any).action).toBe('navigate');
  });

  it('navigate() with narration emits narration after action', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    const ctx = mockRecordingContext([
      { text: 'Go to the page', audioFile: '/tmp/n0.wav', durationMs: 800 },
    ]);
    const sw = createHelpers(page, collector, ctx);

    await sw.navigate('http://localhost:3000', { narration: 'Go to the page' });
    const events = collector.getEvents();
    const types = events.map(e => e.type);

    // navigate emits narration first (from emitNarration), then action
    expect(types[0]).toBe('narration');
    expect(types).toContain('action');
  });

  it('wait() emits a pacing wait event and waits real time', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    const ctx = mockRecordingContext();
    const sw = createHelpers(page, collector, ctx);

    await sw.wait(2000);
    const events = collector.getEvents();

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('wait');
    expect((events[0] as any).durationMs).toBe(2000);
    expect((events[0] as any).reason).toBe('pacing');
    expect(page.waitForTimeout).toHaveBeenCalledWith(2000);
  });

  it('press() emits action event with key as selector', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    const ctx = mockRecordingContext();
    const sw = createHelpers(page, collector, ctx);

    await sw.press('Enter');
    const events = collector.getEvents();

    expect(events[0].type).toBe('action');
    expect((events[0] as any).action).toBe('press');
    expect((events[0] as any).selector).toBe('Enter');
  });

  it('updates cursor position across actions', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    const ctx = mockRecordingContext();
    const sw = createHelpers(page, collector, ctx);

    await sw.click('.first');
    await sw.click('.second');

    const cursorEvents = collector.getEvents().filter(e => e.type === 'cursor_target');
    expect(cursorEvents).toHaveLength(2);

    const second = cursorEvents[1] as any;
    const firstTarget = cursorEvents[0] as any;
    expect(second.fromX).toBe(firstTarget.toX);
    expect(second.fromY).toBe(firstTarget.toY);
  });

  it('narrate() pauses capture, pops from queue, captures frame and holds', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    const ctx = mockRecordingContext([
      { text: 'Test narration', audioFile: '/tmp/n0.wav', durationMs: 2000 },
    ]);
    const sw = createHelpers(page, collector, ctx);

    await sw.narrate('Test narration');

    expect(ctx.pauseCapture).toHaveBeenCalled();
    expect(ctx.popNarration).toHaveBeenCalled();
    expect(ctx.captureOneFrame).toHaveBeenCalled();
    expect(ctx.addHold).toHaveBeenCalled();
    expect(ctx.resumeCapture).toHaveBeenCalled();

    const narrationEvent = collector.getEvents().find(e => e.type === 'narration') as any;
    expect(narrationEvent.text).toBe('Test narration');
    expect(narrationEvent.audioFile).toBe('/tmp/n0.wav');
    expect(narrationEvent.audioDurationMs).toBe(2000);
  });

  it('transition() sets transitionPending and pauses capture', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    const ctx = mockRecordingContext();
    const sw = createHelpers(page, collector, ctx);

    await sw.transition();

    expect(ctx.pauseCapture).toHaveBeenCalled();
    expect(ctx.addTransitionMarker).toHaveBeenCalled();
    expect(ctx.transitionPending).toBe(true);
  });

  it('transition() passes through custom type and duration', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    const ctx = mockRecordingContext();
    const sw = createHelpers(page, collector, ctx);

    await sw.transition({ type: 'wipe', duration: 800 });

    const markerCall = (ctx.addTransitionMarker as any).mock.calls[0][0];
    expect(markerCall.transition).toBe('wipe');
    expect(markerCall.durationFrames).toBe(24); // ceil(800/1000 * 30)
  });

  it('transition() throws on zero duration', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    const ctx = mockRecordingContext();
    const sw = createHelpers(page, collector, ctx);

    await expect(sw.transition({ duration: 0 })).rejects.toThrow('positive number');
  });

  it('transition() throws on negative duration', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    const ctx = mockRecordingContext();
    const sw = createHelpers(page, collector, ctx);

    await expect(sw.transition({ duration: -100 })).rejects.toThrow('positive number');
  });

  it('transition() throws on NaN duration', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    const ctx = mockRecordingContext();
    const sw = createHelpers(page, collector, ctx);

    await expect(sw.transition({ duration: NaN })).rejects.toThrow('positive number');
  });

  it('transition() warns on back-to-back calls', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    const ctx = mockRecordingContext();
    const sw = createHelpers(page, collector, ctx);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await sw.transition();
    expect(warnSpy).not.toHaveBeenCalled();

    await sw.transition({ type: 'wipe' });
    expect(warnSpy).toHaveBeenCalledOnce();

    warnSpy.mockRestore();
  });

  it('click() resolves pending transition', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    const ctx = mockRecordingContext();
    const sw = createHelpers(page, collector, ctx);

    await sw.transition();
    expect(ctx.transitionPending).toBe(true);

    await sw.click('.btn');
    expect(ctx.transitionPending).toBe(false);
    // captureOneFrame called: once for transition resolution
    expect(ctx.captureOneFrame).toHaveBeenCalled();
    expect(ctx.resumeCapture).toHaveBeenCalled();
  });

  it('navigate() resolves pending transition', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    const ctx = mockRecordingContext();
    const sw = createHelpers(page, collector, ctx);

    await sw.transition();
    expect(ctx.transitionPending).toBe(true);

    await sw.navigate('http://localhost:3000');
    expect(ctx.transitionPending).toBe(false);
  });

  it('wait() during transition captures and holds', async () => {
    const page = mockPage();
    const collector = new TimelineCollector();
    const ctx = mockRecordingContext();
    const sw = createHelpers(page, collector, ctx);

    ctx.transitionPending = true;
    await sw.wait(500);

    expect(page.waitForTimeout).toHaveBeenCalledWith(500);
    expect(ctx.captureOneFrame).toHaveBeenCalled();
    // wait does NOT resolve the transition — transitionPending stays true
    expect(ctx.transitionPending).toBe(true);
  });
});
