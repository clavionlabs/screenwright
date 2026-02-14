import type { SceneEvent, TimelineEvent } from '../timeline/types.js';

export const SLIDE_DURATION_MS = 2000;

export interface SlideSegment {
  slideStartMs: number;
  slideEndMs: number;
  sceneTitle: string;
  sceneDescription?: string;
}

/**
 * Compute the output-time intervals where each scene slide is shown.
 * Each slide is inserted *before* the scene's recorded content.
 */
export function computeSlideSegments(
  scenes: SceneEvent[],
  slideDurationMs: number,
): SlideSegment[] {
  const segments: SlideSegment[] = [];
  let accumulated = 0;
  for (const scene of scenes) {
    const slideStartMs = scene.timestampMs + accumulated;
    const slideEndMs = slideStartMs + slideDurationMs;
    segments.push({
      slideStartMs,
      slideEndMs,
      sceneTitle: scene.title,
      sceneDescription: scene.description,
    });
    accumulated += slideDurationMs;
  }
  return segments;
}

/**
 * Map an output-time position back to its source-time position.
 * During a slide, returns the scene's timestamp (freeze-frame).
 * During video segments, subtracts accumulated slide durations.
 */
export function sourceTimeMs(
  outputTimeMs: number,
  scenes: SceneEvent[],
  slideDurationMs: number,
): number {
  let accumulated = 0;
  for (const scene of scenes) {
    const slideStart = scene.timestampMs + accumulated;
    const slideEnd = slideStart + slideDurationMs;

    if (outputTimeMs < slideStart) {
      return outputTimeMs - accumulated;
    }
    if (outputTimeMs < slideEnd) {
      return scene.timestampMs;
    }
    accumulated += slideDurationMs;
  }
  return outputTimeMs - accumulated;
}

export function totalSlideDurationMs(
  sceneCount: number,
  slideDurationMs: number,
): number {
  return sceneCount * slideDurationMs;
}

/**
 * Shift every event's timestampMs forward by the accumulated slide
 * durations that precede it. Returns a new array (no mutation).
 */
export function remapEvents<T extends TimelineEvent>(
  events: T[],
  scenes: SceneEvent[],
  slideDurationMs: number,
): T[] {
  return events.map(event => {
    let offset = 0;
    for (const scene of scenes) {
      if (event.timestampMs >= scene.timestampMs) {
        offset += slideDurationMs;
      } else {
        break;
      }
    }
    return { ...event, timestampMs: event.timestampMs + offset };
  });
}
