import { describe, it, expect } from 'vitest';
import {
  expandedFrameCount,
  sourceFrameImage,
  totalOutputFrames,
  resolveOutputFrame,
  remapEventsForOutput,
} from '../../src/composition/frame-resolve.js';
import type { ManifestEntry, TransitionMarker, ActionEvent, NarrationEvent } from '../../src/timeline/types.js';

function frame(file: string): ManifestEntry {
  return { type: 'frame', file };
}

function hold(file: string, count: number): ManifestEntry {
  return { type: 'hold', file, count };
}

function marker(afterEntryIndex: number, durationFrames: number, transition: 'fade' | 'wipe' = 'fade'): TransitionMarker {
  return { afterEntryIndex, durationFrames, transition };
}

describe('expandedFrameCount', () => {
  it('counts single frames as 1 each', () => {
    expect(expandedFrameCount([frame('a'), frame('b'), frame('c')])).toBe(3);
  });

  it('expands holds by count', () => {
    expect(expandedFrameCount([frame('a'), hold('b', 10), frame('c')])).toBe(12);
  });

  it('returns 0 for empty manifest', () => {
    expect(expandedFrameCount([])).toBe(0);
  });

  it('handles all holds', () => {
    expect(expandedFrameCount([hold('a', 5), hold('b', 3)])).toBe(8);
  });
});

describe('sourceFrameImage', () => {
  const manifest: ManifestEntry[] = [
    frame('a.jpg'),
    hold('b.jpg', 3),
    frame('c.jpg'),
    frame('d.jpg'),
  ];

  it('returns first frame for index 0', () => {
    expect(sourceFrameImage(manifest, 0)).toBe('a.jpg');
  });

  it('returns hold file for indices within hold range', () => {
    expect(sourceFrameImage(manifest, 1)).toBe('b.jpg');
    expect(sourceFrameImage(manifest, 2)).toBe('b.jpg');
    expect(sourceFrameImage(manifest, 3)).toBe('b.jpg');
  });

  it('returns frames after hold', () => {
    expect(sourceFrameImage(manifest, 4)).toBe('c.jpg');
    expect(sourceFrameImage(manifest, 5)).toBe('d.jpg');
  });

  it('clamps to last frame for out-of-range index', () => {
    expect(sourceFrameImage(manifest, 100)).toBe('d.jpg');
  });
});

describe('totalOutputFrames', () => {
  it('equals source frames with no transitions', () => {
    const manifest = [frame('a'), frame('b'), frame('c')];
    expect(totalOutputFrames(manifest, [])).toBe(3);
  });

  it('adds transition frames minus consumed', () => {
    const manifest = [frame('a'), frame('b'), frame('c')];
    // Transition after entry 0, 15 frames. Adds 15, consumes 1.
    expect(totalOutputFrames(manifest, [marker(0, 15)])).toBe(3 + 15 - 1);
  });

  it('handles multiple transitions', () => {
    const manifest = [frame('a'), frame('b'), frame('c'), frame('d')];
    expect(totalOutputFrames(manifest, [marker(0, 10), marker(2, 5)])).toBe(4 + 10 + 5 - 2);
  });
});

describe('resolveOutputFrame', () => {
  it('resolves source frames 1:1 with no transitions', () => {
    const manifest = [frame('a.jpg'), frame('b.jpg'), frame('c.jpg')];
    expect(resolveOutputFrame(0, manifest, [])).toEqual({ type: 'source', file: 'a.jpg' });
    expect(resolveOutputFrame(1, manifest, [])).toEqual({ type: 'source', file: 'b.jpg' });
    expect(resolveOutputFrame(2, manifest, [])).toEqual({ type: 'source', file: 'c.jpg' });
  });

  it('resolves transition frames', () => {
    // manifest: [a, b, c]. Transition after entry 0 (source frame 0), 3 frames.
    // Output: frame 0 = a (source), frames 1-3 = transition, frame 4 = c (b consumed)
    const manifest = [frame('a.jpg'), frame('b.jpg'), frame('c.jpg')];
    const transitions = [marker(0, 3)];

    const r0 = resolveOutputFrame(0, manifest, transitions);
    expect(r0).toEqual({ type: 'source', file: 'a.jpg' });

    const r1 = resolveOutputFrame(1, manifest, transitions);
    expect(r1.type).toBe('transition');
    if (r1.type === 'transition') {
      expect(r1.beforeFile).toBe('a.jpg');
      expect(r1.afterFile).toBe('b.jpg');
      expect(r1.progress).toBeCloseTo(1 / 3, 5);
    }

    const r2 = resolveOutputFrame(2, manifest, transitions);
    expect(r2.type).toBe('transition');
    if (r2.type === 'transition') {
      expect(r2.progress).toBeCloseTo(2 / 3, 5);
    }

    const r3 = resolveOutputFrame(3, manifest, transitions);
    expect(r3.type).toBe('transition');
    if (r3.type === 'transition') {
      expect(r3.progress).toBeCloseTo(1, 5);
    }

    // Frame 4: source frame 2 (frame 1 consumed) = c.jpg
    const r4 = resolveOutputFrame(4, manifest, transitions);
    expect(r4).toEqual({ type: 'source', file: 'c.jpg' });
  });

  it('resolves with holds', () => {
    // manifest: [frame a, hold b x3, frame c]. Transition after entry 1 (hold).
    // Expanded: a(0), b(1), b(2), b(3), c(4). Transition after last b frame (3).
    const manifest: ManifestEntry[] = [frame('a.jpg'), hold('b.jpg', 3), frame('c.jpg')];
    const transitions = [marker(1, 2)];

    // Source frame 3 (last of hold) is at output 3
    const r3 = resolveOutputFrame(3, manifest, transitions);
    expect(r3).toEqual({ type: 'source', file: 'b.jpg' });

    // Output 4-5: transition
    const r4 = resolveOutputFrame(4, manifest, transitions);
    expect(r4.type).toBe('transition');
    if (r4.type === 'transition') {
      expect(r4.beforeFile).toBe('b.jpg');
      expect(r4.afterFile).toBe('c.jpg');
    }

    // Output 5: still in transition
    const r5 = resolveOutputFrame(5, manifest, transitions);
    expect(r5.type).toBe('transition');
  });

  it('handles multiple transitions', () => {
    // 5 frames: a, b, c, d, e. Transitions after 0 (2 frames) and after 2 (2 frames).
    const manifest = [frame('a'), frame('b'), frame('c'), frame('d'), frame('e')];
    const transitions = [marker(0, 2), marker(2, 2)];

    // Output 0: a (source)
    expect(resolveOutputFrame(0, manifest, transitions).type).toBe('source');
    // Output 1-2: transition a->b
    expect(resolveOutputFrame(1, manifest, transitions).type).toBe('transition');
    expect(resolveOutputFrame(2, manifest, transitions).type).toBe('transition');
    // Output 3: c (source, offset by 1: 2 inserted - 1 consumed)
    const r3 = resolveOutputFrame(3, manifest, transitions);
    expect(r3).toEqual({ type: 'source', file: 'c' });
  });
});

describe('remapEventsForOutput', () => {
  it('returns same timestamps with no transitions', () => {
    const manifest = [frame('a'), frame('b')];
    const events: ActionEvent[] = [
      { type: 'action', id: 'a1', timestampMs: 0, action: 'click', selector: '.x', durationMs: 100, boundingBox: null },
      { type: 'action', id: 'a2', timestampMs: 33.33, action: 'click', selector: '.y', durationMs: 100, boundingBox: null },
    ];
    const result = remapEventsForOutput(events, manifest, []);
    expect(result[0].timestampMs).toBe(0);
    expect(result[1].timestampMs).toBe(33.33);
  });

  it('offsets events after a transition', () => {
    // manifest: [a, b, c]. Transition after entry 0, 15 frames.
    // Source frame 0 at time 0ms. Events after 0ms get offset by (15-1) * 33.33ms
    const manifest = [frame('a'), frame('b'), frame('c')];
    const transitions = [marker(0, 15)];
    const events: NarrationEvent[] = [
      { type: 'narration', id: 'n1', timestampMs: 0, text: 'before' },
      { type: 'narration', id: 'n2', timestampMs: 100, text: 'after' },
    ];
    const result = remapEventsForOutput(events, manifest, transitions);
    // Event at 0ms: not after the transition (at source frame 0)
    expect(result[0].timestampMs).toBe(0);
    // Event at 100ms: after transition source time (0ms), so offset
    expect(result[1].timestampMs).toBeGreaterThan(100);
  });
});
