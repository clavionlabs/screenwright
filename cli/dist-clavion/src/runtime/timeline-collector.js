import { timelineSchema } from '../timeline/schema.js';
export class TimelineCollector {
    events = [];
    counter = 0;
    nextId() {
        return `ev-${String(++this.counter).padStart(3, '0')}`;
    }
    emit(event) {
        const id = event.id ?? this.nextId();
        const full = { ...event, id };
        this.events.push(full);
        return id;
    }
    getEvents() {
        return this.events;
    }
    finalize(metadata) {
        const timeline = {
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
