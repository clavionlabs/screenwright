import type { ActionEvent, SceneEvent, SceneSlideConfig, TimelineEvent, TransitionEvent } from '../timeline/types.js';

export const DEFAULT_SLIDE_DURATION_MS = 2000;

export function msToFrames(ms: number, fps: number): number {
  return Math.round((ms / 1000) * fps);
}

export interface ResolvedSlideScene {
  timestampMs: number;
  slideDurationMs: number;
  /** Source-time dead zone after the slide (transition wait + optional navigate load). */
  deadAfterMs: number;
}

export interface SlideSegment {
  slideStartMs: number;
  slideEndMs: number;
  slideDurationMs: number;
  sceneTitle: string;
  sceneDescription?: string;
  slideConfig: SceneSlideConfig;
}

/**
 * Filter scenes that have a `slide` field and resolve their duration.
 * When allEvents is provided, also computes the dead zone after each slide
 * (stale source time from transition waits + navigate page loads).
 */
export function resolveSlideScenes(
  scenes: SceneEvent[],
  allEvents?: TimelineEvent[],
): ResolvedSlideScene[] {
  return scenes
    .filter(s => s.slide !== undefined)
    .map(s => {
      let deadAfterMs = 0;
      if (allEvents) {
        const afterTrans = allEvents.find(
          (e): e is TransitionEvent =>
            e.type === 'transition' && Math.abs(e.timestampMs - s.timestampMs) < 50
        );
        if (afterTrans) {
          const transEnd = s.timestampMs + afterTrans.durationMs;
          const firstAction = allEvents.find(
            (e): e is ActionEvent =>
              e.type === 'action' && e.timestampMs >= transEnd - 50
          );
          if (firstAction?.action === 'navigate') {
            const settled = allEvents.find(
              e => e.timestampMs > firstAction.timestampMs + 50
            );
            deadAfterMs = settled
              ? settled.timestampMs - s.timestampMs
              : afterTrans.durationMs;
          } else {
            deadAfterMs = afterTrans.durationMs;
          }
        }
      }
      return {
        timestampMs: s.timestampMs,
        slideDurationMs: s.slide!.duration ?? DEFAULT_SLIDE_DURATION_MS,
        deadAfterMs,
      };
    });
}

/**
 * Compute the output-time intervals where each scene slide is shown.
 * Each slide is inserted *before* the scene's recorded content.
 */
export function computeSlideSegments(scenes: SceneEvent[]): SlideSegment[] {
  const segments: SlideSegment[] = [];
  let accumulated = 0;

  for (const scene of scenes) {
    if (!scene.slide) continue;

    const slideDurationMs = scene.slide.duration ?? DEFAULT_SLIDE_DURATION_MS;
    const slideStartMs = scene.timestampMs + accumulated;

    segments.push({
      slideStartMs,
      slideEndMs: slideStartMs + slideDurationMs,
      slideDurationMs,
      sceneTitle: scene.title,
      sceneDescription: scene.description,
      slideConfig: scene.slide,
    });
    accumulated += slideDurationMs;
  }
  return segments;
}

/**
 * Map an output-time position back to its source-time position.
 * During a slide, returns the scene's timestamp (freeze-frame).
 * During video segments, subtracts accumulated slide durations.
 * Source times that fall in a dead zone are clamped to its end.
 */
export function sourceTimeMs(
  outputTimeMs: number,
  slideScenes: ResolvedSlideScene[],
): number {
  const sorted = [...slideScenes].sort((a, b) => a.timestampMs - b.timestampMs);
  let accumulated = 0;
  for (const ss of sorted) {
    const slideStart = ss.timestampMs + accumulated;
    const slideEnd = slideStart + ss.slideDurationMs;

    if (outputTimeMs < slideStart) {
      return clampDeadZones(outputTimeMs - accumulated, sorted);
    }
    if (outputTimeMs < slideEnd) {
      return ss.timestampMs;
    }
    accumulated += ss.slideDurationMs;
  }
  return clampDeadZones(outputTimeMs - accumulated, sorted);
}

function clampDeadZones(sourceTime: number, slides: ResolvedSlideScene[]): number {
  for (const ss of slides) {
    if (ss.deadAfterMs > 0 && sourceTime >= ss.timestampMs && sourceTime < ss.timestampMs + ss.deadAfterMs) {
      return ss.timestampMs + ss.deadAfterMs;
    }
  }
  return sourceTime;
}

export function totalSlideDurationMs(
  slideScenes: ResolvedSlideScene[],
): number {
  let total = 0;
  for (const ss of slideScenes) {
    total += ss.slideDurationMs;
  }
  return total;
}

/**
 * Shift every event's timestampMs forward by the accumulated slide
 * durations that precede it. Returns a new array (no mutation).
 */
export function remapEvents<T extends TimelineEvent>(
  events: T[],
  slideScenes: ResolvedSlideScene[],
): T[] {
  const sorted = [...slideScenes].sort((a, b) => a.timestampMs - b.timestampMs);
  return events.map(event => {
    let offset = 0;
    for (const ss of sorted) {
      if (event.timestampMs >= ss.timestampMs) {
        offset += ss.slideDurationMs;
      } else {
        break;
      }
    }
    return { ...event, timestampMs: event.timestampMs + offset };
  });
}
