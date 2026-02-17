import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SLIDE_DURATION_MS,
  resolveSlideScenes,
  computeSlideSegments,
  sourceTimeMs,
  totalSlideDurationMs,
  remapEvents,
} from '../../src/composition/time-remap.js';
import type { ResolvedSlideScene } from '../../src/composition/time-remap.js';
import type { SceneEvent, SceneSlideConfig, ActionEvent, NarrationEvent, TransitionEvent } from '../../src/timeline/types.js';

function scene(timestampMs: number, title: string, opts?: { description?: string; slide?: SceneSlideConfig }): SceneEvent {
  return {
    type: 'scene', id: `s-${timestampMs}`, timestampMs, title,
    description: opts?.description,
    slide: opts?.slide,
  };
}

function ss(timestampMs: number, slideDurationMs: number = DEFAULT_SLIDE_DURATION_MS, deadAfterMs = 0): ResolvedSlideScene {
  return { timestampMs, slideDurationMs, deadAfterMs };
}

function action(timestampMs: number): ActionEvent {
  return {
    type: 'action', id: `a-${timestampMs}`, timestampMs,
    action: 'click', selector: 'button', durationMs: 100,
    boundingBox: { x: 0, y: 0, width: 10, height: 10 },
  };
}

function narration(timestampMs: number, text: string): NarrationEvent {
  return { type: 'narration', id: `n-${timestampMs}`, timestampMs, text };
}

describe('DEFAULT_SLIDE_DURATION_MS', () => {
  it('is 2000', () => {
    expect(DEFAULT_SLIDE_DURATION_MS).toBe(2000);
  });
});

describe('resolveSlideScenes', () => {
  it('returns empty for scenes without slide', () => {
    const scenes = [scene(0, 'A'), scene(5000, 'B')];
    expect(resolveSlideScenes(scenes)).toEqual([]);
  });

  it('filters to scenes with slide field', () => {
    const scenes = [
      scene(0, 'A', { slide: {} }),
      scene(5000, 'B'),
      scene(10000, 'C', { slide: { duration: 3000 } }),
    ];
    const result = resolveSlideScenes(scenes);
    expect(result).toEqual([
      { timestampMs: 0, slideDurationMs: 2000, deadAfterMs: 0 },
      { timestampMs: 10000, slideDurationMs: 3000, deadAfterMs: 0 },
    ]);
  });

  it('uses default duration when slide.duration is omitted', () => {
    const scenes = [scene(0, 'A', { slide: {} })];
    expect(resolveSlideScenes(scenes)[0].slideDurationMs).toBe(2000);
  });

  it('uses custom duration from slide config', () => {
    const scenes = [scene(0, 'A', { slide: { duration: 5000 } })];
    expect(resolveSlideScenes(scenes)[0].slideDurationMs).toBe(5000);
  });

  it('computes deadAfterMs from transition only (no navigate)', () => {
    const s = scene(1800, 'A', { slide: {} });
    const trans: TransitionEvent = {
      type: 'transition', id: 't1', timestampMs: 1800, transition: 'fade', durationMs: 500,
    };
    const fill: ActionEvent = {
      type: 'action', id: 'a1', timestampMs: 2400, action: 'fill',
      selector: 'input', durationMs: 100, boundingBox: null,
    };
    const result = resolveSlideScenes([s], [s, trans, fill]);
    expect(result[0].deadAfterMs).toBe(500);
  });

  it('extends deadAfterMs past navigate to settled event', () => {
    const s = scene(1800, 'A', { slide: {} });
    const trans: TransitionEvent = {
      type: 'transition', id: 't1', timestampMs: 1800, transition: 'fade', durationMs: 500,
    };
    // Navigate fires at 2300 (transEnd), page loads by 2500
    const nav: ActionEvent = {
      type: 'action', id: 'a1', timestampMs: 2300, action: 'navigate',
      selector: 'http://example.com', durationMs: 0, boundingBox: null,
    };
    // First event after navigate = settled
    const wait: import('../../src/timeline/types.js').WaitEvent = {
      type: 'wait', id: 'w1', timestampMs: 2500, durationMs: 1000, reason: 'pacing',
    };
    const result = resolveSlideScenes([s], [s, trans, nav, wait]);
    // deadAfterMs = settled.timestampMs - scene.timestampMs = 2500 - 1800 = 700
    expect(result[0].deadAfterMs).toBe(700);
  });

  it('deadAfterMs 0 when no transition after slide', () => {
    const s = scene(0, 'A', { slide: {} });
    const click: ActionEvent = {
      type: 'action', id: 'a1', timestampMs: 500, action: 'click',
      selector: 'button', durationMs: 100, boundingBox: null,
    };
    const result = resolveSlideScenes([s], [s, click]);
    expect(result[0].deadAfterMs).toBe(0);
  });
});

describe('totalSlideDurationMs', () => {
  it('sums variable durations', () => {
    expect(totalSlideDurationMs([ss(0, 2000), ss(5000, 3000)])).toBe(5000);
  });

  it('returns 0 for empty array', () => {
    expect(totalSlideDurationMs([])).toBe(0);
  });

  it('works with single slide', () => {
    expect(totalSlideDurationMs([ss(0, 1500)])).toBe(1500);
  });
});

describe('computeSlideSegments', () => {
  it('returns empty array for no slide scenes', () => {
    const scenes = [scene(0, 'A'), scene(5000, 'B')];
    expect(computeSlideSegments(scenes)).toEqual([]);
  });

  it('computes single scene at t=0 with default duration', () => {
    const scenes = [scene(0, 'Intro', { slide: {} })];
    const segments = computeSlideSegments(scenes);
    expect(segments).toEqual([
      { slideStartMs: 0, slideEndMs: 2000, slideDurationMs: 2000, sceneTitle: 'Intro', sceneDescription: undefined, slideConfig: {} },
    ]);
  });

  it('computes multiple scenes with accumulated offsets', () => {
    const scenes = [
      scene(0, 'Intro', { slide: {} }),
      scene(8000, 'Feature', { description: 'Cool feature', slide: {} }),
      scene(15000, 'Outro', { slide: {} }),
    ];
    const segments = computeSlideSegments(scenes);
    expect(segments).toEqual([
      { slideStartMs: 0, slideEndMs: 2000, slideDurationMs: 2000, sceneTitle: 'Intro', sceneDescription: undefined, slideConfig: {} },
      { slideStartMs: 10000, slideEndMs: 12000, slideDurationMs: 2000, sceneTitle: 'Feature', sceneDescription: 'Cool feature', slideConfig: {} },
      { slideStartMs: 19000, slideEndMs: 21000, slideDurationMs: 2000, sceneTitle: 'Outro', sceneDescription: undefined, slideConfig: {} },
    ]);
  });

  it('handles mixed durations', () => {
    const slideA = { duration: 1000 };
    const slideB = { duration: 3000 };
    const scenes = [
      scene(0, 'Intro', { slide: slideA }),
      scene(5000, 'Middle', { slide: slideB }),
    ];
    const segments = computeSlideSegments(scenes);
    expect(segments).toEqual([
      { slideStartMs: 0, slideEndMs: 1000, slideDurationMs: 1000, sceneTitle: 'Intro', sceneDescription: undefined, slideConfig: slideA },
      { slideStartMs: 6000, slideEndMs: 9000, slideDurationMs: 3000, sceneTitle: 'Middle', sceneDescription: undefined, slideConfig: slideB },
    ]);
  });

  it('skips scenes without slides in segment list', () => {
    const scenes = [
      scene(0, 'A', { slide: {} }),
      scene(5000, 'B'),  // no slide
      scene(10000, 'C', { slide: {} }),
    ];
    const segments = computeSlideSegments(scenes);
    expect(segments).toHaveLength(2);
    expect(segments[0].sceneTitle).toBe('A');
    expect(segments[1].sceneTitle).toBe('C');
    // C's slide starts at 10000 + 2000 (accumulated from A's slide)
    expect(segments[1].slideStartMs).toBe(12000);
  });
});

describe('sourceTimeMs', () => {
  it('identity when no slide scenes', () => {
    expect(sourceTimeMs(5000, [])).toBe(5000);
  });

  it('single slide at t=0: first 2s returns freeze-frame', () => {
    const slides = [ss(0)];
    expect(sourceTimeMs(0, slides)).toBe(0);
    expect(sourceTimeMs(1000, slides)).toBe(0);
    expect(sourceTimeMs(1999, slides)).toBe(0);
  });

  it('single slide at t=0: after slide maps back correctly', () => {
    const slides = [ss(0)];
    expect(sourceTimeMs(2000, slides)).toBe(0);
    expect(sourceTimeMs(5000, slides)).toBe(3000);
  });

  it('multiple slides: maps output to source correctly', () => {
    const slides = [ss(0), ss(8000), ss(15000)];

    // During first slide (0-2000 output): freeze at 0
    expect(sourceTimeMs(500, slides)).toBe(0);

    // Video segment after first slide: output 2000-10000 -> source 0-8000
    expect(sourceTimeMs(2000, slides)).toBe(0);
    expect(sourceTimeMs(6000, slides)).toBe(4000);

    // During second slide (10000-12000 output): freeze at 8000
    expect(sourceTimeMs(10000, slides)).toBe(8000);
    expect(sourceTimeMs(11000, slides)).toBe(8000);

    // Video after second slide: output 12000-19000 -> source 8000-15000
    expect(sourceTimeMs(12000, slides)).toBe(8000);
    expect(sourceTimeMs(15000, slides)).toBe(11000);

    // During third slide (19000-21000 output): freeze at 15000
    expect(sourceTimeMs(19000, slides)).toBe(15000);

    // After all slides: output 21000+ -> source 15000+
    expect(sourceTimeMs(21000, slides)).toBe(15000);
    expect(sourceTimeMs(26000, slides)).toBe(20000);
  });

  it('variable durations: maps correctly', () => {
    const slides = [ss(0, 1000), ss(5000, 3000)];

    // During first slide (0-1000): freeze at 0
    expect(sourceTimeMs(500, slides)).toBe(0);

    // After first slide: output 1000 -> source 0
    expect(sourceTimeMs(1000, slides)).toBe(0);
    expect(sourceTimeMs(3000, slides)).toBe(2000);

    // During second slide (6000-9000): freeze at 5000
    expect(sourceTimeMs(6000, slides)).toBe(5000);
    expect(sourceTimeMs(8000, slides)).toBe(5000);

    // After second slide: output 9000 -> source 5000
    expect(sourceTimeMs(9000, slides)).toBe(5000);
    expect(sourceTimeMs(11000, slides)).toBe(7000);
  });

  it('exact slide boundary returns source time after slide', () => {
    const slides = [ss(0)];
    expect(sourceTimeMs(2000, slides)).toBe(0);
  });

  it('clamps source time past dead zone after slide', () => {
    // Slide at t=1800, duration 2000ms, dead zone 700ms (transition 500ms + navigate 200ms)
    const slides = [ss(1800, 2000, 700)];
    // After slide (output 3800+): source = output - 2000
    // Source 1800 is in dead zone [1800, 2500) → clamp to 2500
    expect(sourceTimeMs(3800, slides)).toBe(2500);
    // Source 2000 is in dead zone → clamp to 2500
    expect(sourceTimeMs(4000, slides)).toBe(2500);
    // Source 2499 is in dead zone → clamp to 2500
    expect(sourceTimeMs(4499, slides)).toBe(2500);
    // Source 2500 is at dead zone end → no clamp
    expect(sourceTimeMs(4500, slides)).toBe(2500);
    // Source 2600 is past dead zone → normal
    expect(sourceTimeMs(4600, slides)).toBe(2600);
  });

  it('dead zone of 0 has no effect', () => {
    const slides = [ss(0, 2000, 0)];
    expect(sourceTimeMs(2000, slides)).toBe(0);
    expect(sourceTimeMs(3000, slides)).toBe(1000);
  });

  it('clamps dead zone with multiple slides', () => {
    // Slide A at t=0, 2000ms duration, 500ms dead zone
    // Slide B at t=5000, 2000ms duration, 800ms dead zone
    const slides = [ss(0, 2000, 500), ss(5000, 2000, 800)];

    // After slide A (output 2000+): source in [0, 500) → clamp to 500
    expect(sourceTimeMs(2000, slides)).toBe(500);
    expect(sourceTimeMs(2300, slides)).toBe(500);
    // Source 500 → no clamp
    expect(sourceTimeMs(2500, slides)).toBe(500);
    // Source 600 → normal
    expect(sourceTimeMs(2600, slides)).toBe(600);

    // After slide B (output 9000+): source in [5000, 5800) → clamp to 5800
    // output 9000 → source = 9000 - 4000 = 5000 → clamp to 5800
    expect(sourceTimeMs(9000, slides)).toBe(5800);
    expect(sourceTimeMs(9500, slides)).toBe(5800);
    // output 9800 → source = 9800 - 4000 = 5800 → at boundary → no clamp
    expect(sourceTimeMs(9800, slides)).toBe(5800);
    // output 10000 → source = 10000 - 4000 = 6000 → normal
    expect(sourceTimeMs(10000, slides)).toBe(6000);
  });
});

describe('remapEvents', () => {
  it('returns same timestamps when no slide scenes', () => {
    const events = [action(1000), action(5000)];
    const result = remapEvents(events, []);
    expect(result.map(e => e.timestampMs)).toEqual([1000, 5000]);
  });

  it('does not mutate original events', () => {
    const events = [action(1000)];
    const slides = [ss(0)];
    const result = remapEvents(events, slides);
    expect(events[0].timestampMs).toBe(1000);
    expect(result[0].timestampMs).toBe(3000);
  });

  it('shifts events by accumulated slide durations', () => {
    const slides = [ss(0), ss(8000)];
    const events = [
      action(500),      // after slide 0 -> +2000 = 2500
      action(4000),     // after slide 0 -> +2000 = 6000
      narration(8000, 'hi'),  // at slide 1 -> +4000 = 12000
      action(10000),    // after slide 1 -> +4000 = 14000
    ];
    const result = remapEvents(events, slides);
    expect(result.map(e => e.timestampMs)).toEqual([2500, 6000, 12000, 14000]);
  });

  it('events before first slide get no offset', () => {
    const slides = [ss(5000)];
    const events = [action(1000), action(6000)];
    const result = remapEvents(events, slides);
    expect(result.map(e => e.timestampMs)).toEqual([1000, 8000]);
  });

  it('handles variable slide durations', () => {
    const slides = [ss(0, 1000), ss(5000, 3000)];
    const events = [
      action(500),    // after slide 0 (1000ms) -> +1000 = 1500
      action(5000),   // at slide 1 -> +1000+3000 = 9000
      action(8000),   // after slide 1 -> +4000 = 12000
    ];
    const result = remapEvents(events, slides);
    expect(result.map(e => e.timestampMs)).toEqual([1500, 9000, 12000]);
  });

  it('remaps transition events correctly when slides precede them', () => {
    const slides = [ss(0)]; // 2000ms slide at t=0
    const transition: TransitionEvent = {
      type: 'transition',
      id: 't-5000',
      timestampMs: 5000,
      transition: 'fade',
      durationMs: 500,
    };
    const result = remapEvents([transition], slides);
    // Transition at T=5000 with 2000ms slide before it -> output T=7000
    expect(result[0].timestampMs).toBe(7000);
    expect(result[0].type).toBe('transition');
  });
});
