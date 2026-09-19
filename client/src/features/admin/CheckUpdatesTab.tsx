import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { FuseAction } from '@/components/ui/FuseAction';
import { useAdminSummary } from './ReviewLayout';
import { formatProgramDate } from '@/lib/format';
import type { PendingUpdate, UpdateDiffItem } from 'shared/types';

/** Render a diff `from`/`to` value in human form. */
function diffValue(field: UpdateDiffItem['field'], v: string): string {
  if (field === 'audience' && v) {
    try {
      return (JSON.parse(v) as string[]).join(', ');
    } catch {
      return v;
    }
  }
  if ((field === 'startsAt' || field === 'endsAt') && v) return formatProgramDate(v);
  if (field === 'timeline' && v) return v.replace(/\n/g, ' · ');
  return v || '—';
}

const FIELD_LABELS: Record<UpdateDiffItem['field'], string> = {
  name: 'Name',
  summary: 'Summary',
  url: 'Website',
  audience: 'Audience',
  startsAt: 'Start date',
  endsAt: 'Deadline',
  timeline: 'Application timeline',
  category: 'Category',
  imageUrl: 'Image',
};

/**
 * Check updates tab (03-pages §Admin review): pending diffs grouped under
 * their entry; Apply/Discard; `Run demo check` secondary action (admin only,
 * footer). Apply patches the entry server-side immediately (no inverse edge —
 * toast Undo refetches truth).
 */
export function CheckUpdatesTab() {
  const toast = useToast();
  const { refresh } = useAdminSummary();
  const [rows, setRows] = useState<PendingUpdate[] | null>(null);
  const [busy, setBusy] = useState<Set<number>>(new Set());
  const [runningDemo, setRunningDemo] = useState(false);

  const load = useCallback(async () => {
    try {
      setRows(await api.get<PendingUpdate[]>('/api/updates?status=pending'));
    } catch {
      /* SSE retry */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runDemo() {
    setRunningDemo(true);
    try {
      const res = await api.post<{ inserted: number }>('/api/updates/demo/update-check');
      toast.show({ kind: 'info', message: `Check finished: ${res.inserted} sites with changes` });
      await load();
      void refresh();
    } catch {
      toast.show({ kind: 'error', message: 'Check failed. Try again.' });
    } finally {
      setRunningDemo(false);
    }
  }

  function apply(id: number) {
    setBusy((s) => new Set([...s, id]));
    toast.show({ kind: 'update-applied', message: 'Update applied' });
    api
      .post(`/api/updates/${id}/apply`)
      .then(async () => {
        await load();
        void refresh();
      })
      .catch(async () => {
        setBusy((s) => {
          const n = new Set(s);
          n.delete(id);
          return n;
        });
        toast.show({ kind: 'error', message: 'Could not apply. Try again.' });
        await load();
      });
  }

  async function discard(id: number) {
    setBusy((s) => new Set([...s, id]));
    try {
      await api.post(`/api/updates/${id}/discard`);
      toast.show({ kind: 'info', message: 'Discarded' });
    } catch {
      /* already handled */
    }
    await load();
    void refresh();
  }

  const visible = rows === null ? null : rows.filter((r) => !busy.has(r.id));

  return (
    <section aria-label="Check updates">
      {visible === null ? (
        <p className="text-[14px] text-ink-soft" aria-live="polite">…</p>
      ) : visible.length === 0 ? (
        <p className="max-w-[60ch] text-[16px] text-ink-soft">
          No changes detected. Checks run every Monday. {/* copy deck */}
        </p>
      ) : (
        <ul className="space-y-4">
          {visible.map((u) => (
            <li key={u.id} className="rounded-xl border border-mist bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-[16px] font-semibold text-ink">{u.entryName}</h3>
                  <p className="num mt-0.5 text-[13px] text-ink-soft">
                    Detected {formatProgramDate(u.detectedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <FuseAction
                    label="Apply"
                    undoLabel="Undo"
                    variant="primary"
                    onCommit={() => apply(u.id)}
                    onUndo={() => void load()}
                  />
                  <button
                    type="button"
                    onClick={() => void discard(u.id)}
                    className="rounded-full px-4 py-2 text-[14px] font-semibold transition-colors"
                    style={{ background: 'color-mix(in oklab, #8A3B3B 8%, white)', color: '#8A3B3B' }}
                  >
                    Discard
                  </button>
                </div>
              </div>
              <ul className="mt-3 space-y-2">
                {u.diff.map((d, i) => (
                  <li key={i} className="rounded-lg bg-canvas px-3 py-2 text-[14px] text-ink-soft">
                    <span className="font-semibold text-ink">{FIELD_LABELS[d.field]}:</span>{' '}
                    <span>{diffValue(d.field, d.from)}</span>
                    <span aria-hidden="true"> → </span>
                    <span className="font-semibold text-ink">{diffValue(d.field, d.to)}</span>
                    <span className="block text-[13px]">{d.note}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8 border-t border-mist pt-6">
        <button
          type="button"
          onClick={() => void runDemo()}
          disabled={runningDemo}
          className="rounded-lg border border-mist bg-surface px-4 py-2 text-[14px] font-semibold text-ink-soft transition-colors hover:border-ink-soft/40 disabled:opacity-60"
        >
          {runningDemo ? 'Checking…' : 'Run demo check'}
        </button>
      </div>
    </section>
  );
}
