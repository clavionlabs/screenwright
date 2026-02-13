import React from 'react';
import { Audio, Sequence } from 'remotion';
import type { NarrationEvent } from '../timeline/types.js';

function toFileSrc(path: string): string {
  if (!path || path.startsWith('http') || path.startsWith('file://')) return path;
  return `file://${path}`;
}

interface Props {
  narrations: NarrationEvent[];
  fps: number;
}

export const NarrationTrack: React.FC<Props> = ({ narrations, fps }) => {
  return (
    <>
      {narrations
        .filter(n => n.audioFile)
        .map((n, i) => (
          <Sequence key={n.id} from={Math.round((n.timestampMs / 1000) * fps)}>
            <Audio src={toFileSrc(n.audioFile!)} />
          </Sequence>
        ))}
    </>
  );
};
