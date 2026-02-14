import React from 'react';
import { Img, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from 'remotion';
import type { CursorTargetEvent, ActionEvent, NarrationEvent, SceneEvent } from '../timeline/types.js';
import type { ValidatedTimeline } from '../timeline/schema.js';
import type { BrandingConfig } from '../config/config-schema.js';
import { CursorOverlay } from './CursorOverlay.js';
import { NarrationTrack } from './NarrationTrack.js';
import { SceneSlide } from './SceneSlide.js';
import { precomputeCursorPaths } from './cursor-path.js';
import { findClosestFrame } from './frame-lookup.js';
import { SLIDE_DURATION_MS, sourceTimeMs, computeSlideSegments, remapEvents } from './time-remap.js';

interface Props {
  timeline: ValidatedTimeline;
  branding?: BrandingConfig;
}

function msToFrames(ms: number, fps: number): number {
  return Math.round((ms / 1000) * fps);
}

export const DemoVideo: React.FC<Props> = ({ timeline, branding }) => {
  const fps = 30;
  const frame = useCurrentFrame();
  const outputTimeMs = (frame / fps) * 1000;

  const scenes = timeline.events.filter((e): e is SceneEvent => e.type === 'scene');
  const slideDuration = branding ? SLIDE_DURATION_MS : 0;

  const timeMs = branding && scenes.length
    ? sourceTimeMs(outputTimeMs, scenes, slideDuration)
    : outputTimeMs;

  const eventsToUse = branding && scenes.length
    ? remapEvents(timeline.events, scenes, slideDuration)
    : timeline.events;

  const cursorEvents = precomputeCursorPaths(
    eventsToUse.filter((e): e is CursorTargetEvent => e.type === 'cursor_target')
  );

  const clickEvents = eventsToUse.filter(
    (e): e is ActionEvent => e.type === 'action' && e.action === 'click'
  );

  const narrations = eventsToUse.filter(
    (e): e is NarrationEvent => e.type === 'narration'
  );

  const { frameManifest, videoFile } = timeline.metadata;

  let baseLayer: React.ReactNode;
  if (frameManifest && frameManifest.length > 0) {
    const entry = findClosestFrame(frameManifest, timeMs);
    baseLayer = (
      <Img
        src={staticFile(entry.file)}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    );
  } else if (videoFile) {
    baseLayer = <OffthreadVideo src={staticFile(videoFile)} />;
  } else {
    throw new Error('Timeline must have either frameManifest or videoFile');
  }

  const slideSegments = branding ? computeSlideSegments(scenes, slideDuration) : [];

  return (
    <div
      style={{
        position: 'relative',
        width: timeline.metadata.viewport.width,
        height: timeline.metadata.viewport.height,
        overflow: 'hidden',
      }}
    >
      {baseLayer}
      <CursorOverlay cursorEvents={cursorEvents} clickEvents={clickEvents} fps={fps} />
      <NarrationTrack narrations={narrations} fps={fps} />

      {branding && slideSegments.map(seg => (
        <Sequence
          key={seg.sceneTitle}
          from={msToFrames(seg.slideStartMs, fps)}
          durationInFrames={msToFrames(slideDuration, fps)}
        >
          <SceneSlide
            title={seg.sceneTitle}
            description={seg.sceneDescription}
            brandColor={branding.brandColor}
            textColor={branding.textColor}
            fontFamily={branding.fontFamily}
            durationInFrames={msToFrames(slideDuration, fps)}
            fps={fps}
          />
        </Sequence>
      ))}
    </div>
  );
};
