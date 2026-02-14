import { describe, it, expect } from 'vitest';
import {
  SLIDE_DURATION_MS,
  computeSlideSegments,
  sourceTimeMs,
  totalSlideDurationMs,
  remapEvents,
} from '../../src/composition/time-remap.js';
import type { SceneEvent, ActionEvent, NarrationEvent } from '../../src/timeline/types.js';

function scene(timestampMs: number, title: string, description?: string): SceneEvent {
  return { type: 'scene', id: `s-${timestampMs}`, timestampMs, title, description };
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

describe('SLIDE_DURATION_MS', () => {
  it('is 2000', () => {
    expect(SLIDE_DURATION_MS).toBe(2000);
  });
});

describe('totalSlideDurationMs', () => {
  it('multiplies scene count by slide duration', () => {
    expect(totalSlideDurationMs(3, 2000)).toBe(6000);
  });

  it('returns 0 for no scenes', () => {
    expect(totalSlideDurationMs(0, 2000)).toBe(0);
  });
});

describe('computeSlideSegments', () => {
  it('returns empty array for no scenes', () => {
    expect(computeSlideSegments([], 2000)).toEqual([]);
  });

  it('computes single scene at t=0', () => {
    const scenes = [scene(0, 'Intro')];
    const segments = computeSlideSegments(scenes, 2000);
    expect(segments).toEqual([
      { slideStartMs: 0, slideEndMs: 2000, sceneTitle: 'Intro', sceneDescription: undefined },
    ]);
  });

  it('computes multiple scenes with accumulated offsets', () => {
    const scenes = [scene(0, 'Intro'), scene(8000, 'Feature', 'Cool feature'), scene(15000, 'Outro')];
    const segments = computeSlideSegments(scenes, 2000);
    expect(segments).toEqual([
      { slideStartMs: 0, slideEndMs: 2000, sceneTitle: 'Intro', sceneDescription: undefined },
      { slideStartMs: 10000, slideEndMs: 12000, sceneTitle: 'Feature', sceneDescription: 'Cool feature' },
      { slideStartMs: 19000, slideEndMs: 21000, sceneTitle: 'Outro', sceneDescription: undefined },
    ]);
  });
});

describe('sourceTimeMs', () => {
  it('identity when no scenes', () => {
    expect(sourceTimeMs(5000, [], 2000)).toBe(5000);
  });

  it('single scene at t=0: first 2s returns freeze-frame', () => {
    const scenes = [scene(0, 'Intro')];
    // During slide (0-2000ms output) -> freeze at scene time (0)
    expect(sourceTimeMs(0, scenes, 2000)).toBe(0);
    expect(sourceTimeMs(1000, scenes, 2000)).toBe(0);
    expect(sourceTimeMs(1999, scenes, 2000)).toBe(0);
  });

  it('single scene at t=0: after slide maps back correctly', () => {
    const scenes = [scene(0, 'Intro')];
    // Output 2000ms -> source 0ms (start of video after slide)
    expect(sourceTimeMs(2000, scenes, 2000)).toBe(0);
    // Output 5000ms -> source 3000ms
    expect(sourceTimeMs(5000, scenes, 2000)).toBe(3000);
  });

  it('multiple scenes: maps output to source correctly', () => {
    const scenes = [scene(0, 'A'), scene(8000, 'B'), scene(15000, 'C')];
    // Before first slide: impossible (first scene at t=0)

    // During first slide (0-2000 output): freeze at 0
    expect(sourceTimeMs(500, scenes, 2000)).toBe(0);

    // Video segment after first slide: output 2000-10000 -> source 0-8000
    expect(sourceTimeMs(2000, scenes, 2000)).toBe(0);
    expect(sourceTimeMs(6000, scenes, 2000)).toBe(4000);

    // During second slide (10000-12000 output): freeze at 8000
    expect(sourceTimeMs(10000, scenes, 2000)).toBe(8000);
    expect(sourceTimeMs(11000, scenes, 2000)).toBe(8000);

    // Video after second slide: output 12000-19000 -> source 8000-15000
    expect(sourceTimeMs(12000, scenes, 2000)).toBe(8000);
    expect(sourceTimeMs(15000, scenes, 2000)).toBe(11000);

    // During third slide (19000-21000 output): freeze at 15000
    expect(sourceTimeMs(19000, scenes, 2000)).toBe(15000);

    // After all slides: output 21000+ -> source 15000+
    expect(sourceTimeMs(21000, scenes, 2000)).toBe(15000);
    expect(sourceTimeMs(26000, scenes, 2000)).toBe(20000);
  });

  it('exact slide boundary returns source time after slide', () => {
    const scenes = [scene(0, 'A')];
    // Exactly at slide end boundary
    expect(sourceTimeMs(2000, scenes, 2000)).toBe(0);
  });
});

describe('remapEvents', () => {
  it('returns same timestamps when no scenes', () => {
    const events = [action(1000), action(5000)];
    const result = remapEvents(events, [], 2000);
    expect(result.map(e => e.timestampMs)).toEqual([1000, 5000]);
  });

  it('does not mutate original events', () => {
    const events = [action(1000)];
    const scenes = [scene(0, 'A')];
    const result = remapEvents(events, scenes, 2000);
    expect(events[0].timestampMs).toBe(1000);
    expect(result[0].timestampMs).toBe(3000);
  });

  it('shifts events by accumulated slide durations', () => {
    const scenes = [scene(0, 'A'), scene(8000, 'B')];
    const events = [
      action(500),      // after scene A -> +2000 = 2500
      action(4000),     // after scene A -> +2000 = 6000
      narration(8000, 'hi'),  // at scene B -> +4000 = 12000
      action(10000),    // after scene B -> +4000 = 14000
    ];
    const result = remapEvents(events, scenes, 2000);
    expect(result.map(e => e.timestampMs)).toEqual([2500, 6000, 12000, 14000]);
  });

  it('events before first scene get no offset', () => {
    const scenes = [scene(5000, 'A')];
    const events = [action(1000), action(6000)];
    const result = remapEvents(events, scenes, 2000);
    expect(result.map(e => e.timestampMs)).toEqual([1000, 8000]);
  });
});
