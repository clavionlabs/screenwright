import { jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { Composition, registerRoot } from 'remotion';
import { z } from 'zod';
import { DemoVideo } from './DemoVideo.js';
import { timelineSchema } from '../timeline/schema.js';
import { brandingSchema } from '../config/config-schema.js';
import { totalOutputFrames } from './frame-resolve.js';

// Hardcoded — avoid cross-file import that can fail in Remotion webpack bundler
const CHROME_HEIGHT = 72;

const propsSchema = z.object({
    timeline: timelineSchema,
    branding: brandingSchema.optional(),
});
export const RemotionRoot = () => {
    return (_jsx(_Fragment, { children: _jsx(Composition, { id: "DemoVideo", lazyComponent: () => Promise.resolve({ default: DemoVideo }), schema: propsSchema, durationInFrames: 300, fps: 11, width: 1440, height: 1080, defaultProps: {
                timeline: {
                    version: 2,
                    metadata: {
                        testFile: '',
                        scenarioFile: '',
                        recordedAt: new Date().toISOString(),
                        viewport: { width: 1440, height: 1080 },
                        frameManifest: [{ type: 'frame', file: 'placeholder.jpg' }],
                        transitionMarkers: [],
                    },
                    events: [],
                },
            }, calculateMetadata: ({ props }) => {
                const total = totalOutputFrames(props.timeline.metadata.frameManifest, props.timeline.metadata.transitionMarkers);
                return {
                    durationInFrames: Math.max(30, total),
                    fps: props.timeline.metadata.fps ?? 11,
                    width: props.timeline.metadata.viewport.width,
                    height: props.timeline.metadata.viewport.height + CHROME_HEIGHT,
                };
            } }) }));
};
registerRoot(RemotionRoot);
