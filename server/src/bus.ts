import { EventEmitter } from 'node:events';

/**
 * Server-side event bus. Mutations that change the published set emit
 * `entries-changed`; pending-update changes emit `updates-changed`.
 * `/api/stream` bridges both onto SSE (01-architecture.md §5).
 */
export type BusEvent = 'entries-changed' | 'updates-changed';

export class Bus extends EventEmitter {
  emitEntriesChanged(): void {
    this.emit('entries-changed');
  }
  emitUpdatesChanged(): void {
    this.emit('updates-changed');
  }
}

export function createBus(): Bus {
  return new Bus();
}
