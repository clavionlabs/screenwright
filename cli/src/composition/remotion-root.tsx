import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { z } from 'zod';
import { DemoVideo } from './DemoVideo.js';
import { timelineSchema } from '../timeline/schema.js';
import { brandingSchema } from '../config/config-schema.js';
import { totalOutputFrames } from './frame-resolve.js';

const propsSchema = z.object({
  timeline: timelineSchema,
  branding: brandingSchema.optional(),
});

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="DemoVideo"
        lazyComponent={() => Promise.resolve({ default: DemoVideo as any })}
        schema={propsSchema}
        durationInFrames={300}
        fps={30}
        width={1280}
        height={720}
        defaultProps={{
          timeline: {
            version: 2 as const,
            metadata: {
              testFile: '',
              scenarioFile: '',
              recordedAt: new Date().toISOString(),
              viewport: { width: 1280, height: 720 },
              frameManifest: [{ type: 'frame' as const, file: 'placeholder.jpg' }],
              transitionMarkers: [],
            },
            events: [],
          },
        }}
        calculateMetadata={({ props }) => {
          const total = totalOutputFrames(
            props.timeline.metadata.frameManifest,
            props.timeline.metadata.transitionMarkers,
          );
          return {
            durationInFrames: Math.max(30, total),
            fps: 30,
            width: props.timeline.metadata.viewport.width,
            height: props.timeline.metadata.viewport.height,
          };
        }}
      />
    </>
  );
};

registerRoot(RemotionRoot);
