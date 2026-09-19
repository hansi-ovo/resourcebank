import { api } from '@/lib/api';
import type { Entry } from 'shared/types';

/**
 * Client-level undo queue (01-architecture §2: undo is "client-level",
 * reversible only within the fuse window; server transitions have no inverse
 * edges in v1 — removed is terminal, no re-publish).
 *
 * Press (FuseButton onCommit) → optimistic row removal + toast + 7s timer.
 * Undo within window → cancel, nothing ever hits the server.
 * Window expiry → single server mutation, SSE confirms everywhere.
 *
 * The queue is module-level so tab navigation never drops an action.
 */

type PendingAction =
  | { kind: 'single'; action: 'approve' | 'remove' | 'withdraw'; id: number; timer: number }
  | { kind: 'batch'; action: 'approve' | 'remove'; ids: number[]; timer: number };

const queue = new Map<string, PendingAction>();
const listeners = new Set<() => void>();

/** Cached snapshot for useSyncExternalStore — MUST return a stable reference
 *  between changes, or React loops ("getSnapshot should be cached"). */
let snapshot: Set<number> = new Set();

function notify() {
  for (const l of listeners) l();
}

export function onQueueChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function keyFor(kind: 'single' | 'batch', idOrIds: number | number[]): string {
  const ids = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
  return `${kind}:${ids.join(',')}`;
}

function rebuildSnapshot() {
  snapshot = new Set<number>();
  for (const a of queue.values()) {
    if (a.kind === 'single') snapshot.add(a.id);
    else for (const id of a.ids) snapshot.add(id);
  }
}

/** Hides rows whose action is queued (optimistic removal until commit/undo). */
export function hiddenIds(): Set<number> {
  return snapshot;
}

async function send(action: PendingAction): Promise<void> {
  try {
    if (action.kind === 'single') {
      await api.post<Entry>(`/api/entries/${action.id}/${action.action}`);
    } else {
      await api.post('/api/entries/batch', { ids: action.ids, action: action.action });
    }
  } catch {
    /* server rejected (e.g. state changed) — the refetch shows truth */
  }
  notify();
}

/**
 * Schedule a fuse-window action. `undoWindowMs` must match the FuseButton's
 * undoWindow (D12: 7000).
 */
export function scheduleFuseAction(
  action: 'approve' | 'remove' | 'withdraw',
  idOrIds: number | number[],
  undoWindowMs = 7000,
): void {
  const isBatch = Array.isArray(idOrIds) && idOrIds.length > 1;
  const ids = (Array.isArray(idOrIds) ? idOrIds : [idOrIds]) as number[];
  const k = keyFor(isBatch ? 'batch' : 'single', ids);
  if (queue.has(k)) return;
  const timer = window.setTimeout(() => {
    const a = queue.get(k);
    queue.delete(k);
    rebuildSnapshot();
    if (a) void send(a);
  }, undoWindowMs);
  queue.set(k, isBatch ? { kind: 'batch', action: action as 'approve' | 'remove', ids, timer } : { kind: 'single', action, id: ids[0], timer });
  rebuildSnapshot();
  notify();
}

/** Undo: cancel the timer — nothing was sent. */
export function cancelFuseAction(idOrIds: number | number[]): void {
  const ids = (Array.isArray(idOrIds) ? idOrIds : [idOrIds]) as number[];
  const k = keyFor(ids.length > 1 ? 'batch' : 'single', ids);
  const a = queue.get(k);
  if (!a) return;
  window.clearTimeout(a.timer);
  queue.delete(k);
  rebuildSnapshot();
  notify();
}
