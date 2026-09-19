import { Router } from 'express';
import type { Bus } from '../bus';

/**
 * GET /api/stream — public SSE endpoint.
 * Events: `entries-changed`, `updates-changed` (01-architecture.md §5).
 * `X-Accel-Buffering: no` covers the Nginx layer (deployment §9).
 */
export function streamRoutes(bus: Bus): Router {
  const router = Router();

  router.get('/api/stream', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 5000\n\n');
    res.write(': connected\n\n');

    const onEntries = () => res.write('event: entries-changed\ndata: {}\n\n');
    const onUpdates = () => res.write('event: updates-changed\ndata: {}\n\n');
    bus.on('entries-changed', onEntries);
    bus.on('updates-changed', onUpdates);

    const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.on('close', () => {
      clearInterval(ping);
      bus.off('entries-changed', onEntries);
      bus.off('updates-changed', onUpdates);
    });
  });

  return router;
}
