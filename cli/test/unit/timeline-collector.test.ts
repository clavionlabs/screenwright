import { describe, it, expect } from 'vitest';
import { TimelineCollector } from '../../src/runtime/timeline-collector.js';

describe('TimelineCollector', () => {
  it('generates sequential event IDs', () => {
    const collector = new TimelineCollector();
    const id1 = collector.emit({ type: 'scene', timestampMs: 0, title: 'First' });
    const id2 = collector.emit({ type: 'scene', timestampMs: 100, title: 'Second' });
    expect(id1).toBe('ev-001');
    expect(id2).toBe('ev-002');
  });

  it('uses provided timestampMs', () => {
    const collector = new TimelineCollector();
    collector.emit({ type: 'scene', timestampMs: 42, title: 'Test' });
    const events = collector.getEvents();
    expect(events[0].timestampMs).toBe(42);
  });

  it('allows explicit ID override', () => {
    const collector = new TimelineCollector();
    collector.emit({ type: 'scene', id: 'custom-1', timestampMs: 0, title: 'Test' });
    const events = collector.getEvents();
    expect(events[0].id).toBe('custom-1');
  });

  it('finalize() produces valid timeline JSON', () => {
    const collector = new TimelineCollector();
    collector.emit({ type: 'scene', id: 'ev-001', timestampMs: 0, title: 'Start' });
    collector.emit({
      type: 'action', id: 'ev-002', timestampMs: 100,
      action: 'click', selector: '.btn', durationMs: 200,
      boundingBox: { x: 10, y: 20, width: 100, height: 50 },
    });

    const timeline = collector.finalize({
      testFile: 'test.spec.ts',
      scenarioFile: 'demo.ts',
      recordedAt: new Date().toISOString(),
      viewport: { width: 1280, height: 720 },
      frameManifest: [{ type: 'frame', file: 'frames/frame-000001.jpg' }],
      transitionMarkers: [],
    });

    expect(timeline.version).toBe(2);
    expect(timeline.events).toHaveLength(2);
  });

  it('finalize() rejects invalid events', () => {
    const collector = new TimelineCollector();
    collector.emit({ type: 'bogus', id: 'ev-001', timestampMs: 0 });
    expect(() => collector.finalize({
      testFile: 'test.spec.ts',
      scenarioFile: 'demo.ts',
      recordedAt: new Date().toISOString(),
      viewport: { width: 1280, height: 720 },
      frameManifest: [{ type: 'frame', file: 'frames/frame-000001.jpg' }],
      transitionMarkers: [],
    })).toThrow('Invalid timeline');
  });

  it('getEvents() returns all emitted events', () => {
    const collector = new TimelineCollector();
    collector.emit({ type: 'scene', timestampMs: 0, title: 'A' });
    collector.emit({ type: 'scene', timestampMs: 100, title: 'B' });
    collector.emit({ type: 'scene', timestampMs: 200, title: 'C' });

    const events = collector.getEvents();
    expect(events).toHaveLength(3);
  });
});
