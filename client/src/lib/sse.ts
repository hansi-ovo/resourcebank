import { useEffect } from 'react';

/**
 * SSE subscription hook.
 * Events: `entries-changed` → display + admin refresh;
 *         `updates-changed` → admin refresh (see .omo/questions.md).
 * Silently drops EventSource errors — the browser retries per `retry:` hint,
 * and the next event refetches everything anyway.
 */
export function useEventStream(
  onEntriesChanged: () => void,
  onUpdatesChanged: () => void,
): void {
  useEffect(() => {
    const es = new EventSource('/api/stream');
    es.addEventListener('entries-changed', onEntriesChanged);
    es.addEventListener('updates-changed', onUpdatesChanged);
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
