import type { Timeline, TimelineMetadata, TimelineEvent } from '../timeline/types.js';
import { timelineSchema } from '../timeline/schema.js';

type PartialEvent = { type: string; id?: string; timestampMs: number; [key: string]: unknown };

export class TimelineCollector {
  private events: TimelineEvent[] = [];
  private counter = 0;

  nextId(): string {
    return `ev-${String(++this.counter).padStart(3, '0')}`;
  }

  emit(event: PartialEvent): string {
    const id = event.id ?? this.nextId();
    const full = { ...event, id } as TimelineEvent;
    this.events.push(full);
    return id;
  }

  getEvents(): readonly TimelineEvent[] {
    return this.events;
  }

  finalize(metadata: TimelineMetadata): Timeline {
    const timeline: Timeline = {
      version: 2,
      metadata,
      events: [...this.events],
    };

    const result = timelineSchema.safeParse(timeline);
    if (!result.success) {
      throw new Error(`Invalid timeline: ${result.error.message}`);
    }

    return timeline;
  }
}
