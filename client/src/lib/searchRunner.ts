import { api } from './api';
import type { AdminSummary, Scope } from 'shared/types';

/**
 * Module-level search job runner: survives navigation (the search must never
 * block other admin functions — 03-pages §Admin home). Fires `finished`
 * listeners with the number of newly-added review items wherever the admin
 * is in the app.
 */

export interface SearchFinishEvent {
  added: number;
  finishedAt: string | null;
}

const listeners = new Set<(e: SearchFinishEvent) => void>();
let running = false;

export function onSearchFinished(cb: (e: SearchFinishEvent) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function isSearchRunning(): boolean {
  return running;
}

function fire(e: SearchFinishEvent): void {
  for (const l of listeners) l(e);
}

/**
 * Runs a search job and resolves when the server reports it finished.
 * Survives in-page SPA navigation. (Full page reloads are covered by
 * `followRunningSearch`: any admin mount re-attaches to a server-side
 * running job via /api/summary.)
 */
export async function startSearch(prompt: string, scope: Scope): Promise<void> {
  if (running) return;
  running = true;
  try {
    const before = (await api.get<AdminSummary>('/api/summary')).reviewCount;
    await api.post('/api/search', { prompt, scope });
    for (let i = 0; i < 240; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const sum = await api.get<AdminSummary>('/api/summary');
      if (!sum.searchRunning) {
        fire({ added: Math.max(0, sum.reviewCount - before), finishedAt: sum.lastSearchAt });
        return;
      }
    }
    fire({ added: 0, finishedAt: null });
  } catch {
    fire({ added: -1, finishedAt: null }); // signal failure
  } finally {
    running = false;
  }
}

/**
 * Re-attach to a search that started before this page load (the job state
 * lives in the server's searches table). No-op when nothing is running.
 * Returns a cleanup fn.
 */
export async function followRunningSearch(): Promise<() => void> {
  const first = await api.get<AdminSummary>('/api/summary').catch(() => null);
  if (!first?.searchRunning) return () => undefined;
  const before = first.reviewCount;
  const timer = window.setInterval(async () => {
    try {
      const sum = await api.get<AdminSummary>('/api/summary');
      if (!sum.searchRunning) {
        window.clearInterval(timer);
        fire({ added: Math.max(0, sum.reviewCount - before), finishedAt: sum.lastSearchAt });
      }
    } catch {
      /* transient network — next tick retries */
    }
  }, 500);
  return () => window.clearInterval(timer);
}
