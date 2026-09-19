import { schedule, type ScheduledTask } from 'node-cron';

/**
 * Scheduled update check: Monday 09:00 Asia/Shanghai (D11, 01-architecture §4).
 * node-cron 4.x supports timezone strings; the task is idempotent.
 */
export function startScheduler(run: () => Promise<unknown>): ScheduledTask {
  return schedule(
    '0 9 * * 1',
    () => {
      console.log('[scheduler] running scheduled update check (Mon 09:00 Asia/Shanghai)');
      run().catch((err) => console.error('[scheduler] check failed', err));
    },
    { timezone: 'Asia/Shanghai' },
  );
}
