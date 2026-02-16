// Transition showcase — one slide per transition type.
// Keep in sync with transitionTypes in cli/src/timeline/types.ts

const transitions = [
  { type: 'fade',       color: '#FF3CAC' },
  { type: 'wipe',       color: '#00F5A0' },
  { type: 'slide-up',   color: '#7B61FF' },
  { type: 'slide-left', color: '#FF6B35' },
  { type: 'zoom',       color: '#00D4FF' },
  { type: 'doorway',    color: '#E040FB' },
  { type: 'swap',       color: '#FFD600' },
  { type: 'cube',       color: '#00E676' },
];

export default async function showcase(sw) {
  await sw.scene('Transition Showcase', { slide: { duration: 2000 } });

  for (const { type, color } of transitions) {
    await sw.scene(type, { slide: { duration: 1500, brandColor: color } });
    await sw.transition({ type, duration: 800 });
  }

  await sw.scene('Done', { slide: { duration: 2000 } });
}
