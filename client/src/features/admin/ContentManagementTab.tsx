import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui/Toast';
import { EditableCell, InlineInput, TagInput } from '@/components/ui/InlineEditors';
import { CategoryPicker } from '@/components/ui/CategoryPicker';
import { FuseAction } from '@/components/ui/FuseAction';
import { useAdminSummary } from './ReviewLayout';
import { cancelFuseAction, hiddenIds, onQueueChange, scheduleFuseAction } from './pendingActions';
import { domain, formatDateRange } from '@/lib/format';
import type { CategoryId, Entry } from 'shared/types';

function useHiddenIds(): Set<number> {
  return useSyncExternalStore(
    (cb) => onQueueChange(cb),
    () => hiddenIds(),
    () => new Set<number>(),
  );
}

/**
 * Content management tab (03-pages §Admin review): published rows + Withdraw
 * FuseButton (client-level undo window); footer note (⚑).
 * Withdrawal broadcasts to display immediately.
 */
export function ContentManagementTab() {
  const toast = useToast();
  const { refresh } = useAdminSummary();
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [editing, setEditing] = useState<{ id: number; field: 'name' | 'summary' | 'url' | 'audience' } | null>(null);
  const hidden = useHiddenIds();

  const load = useCallback(async () => {
    try {
      setRows(await api.get<Entry[]>('/api/entries?status=published'));
    } catch {
      /* SSE retry */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(
    () =>
      onQueueChange(() => {
        void load();
        void refresh();
      }),
    [load, refresh],
  );

  async function patch(id: number, patchBody: Record<string, unknown>) {
    try {
      const updated = await api.put<Entry>(`/api/entries/${id}`, patchBody);
      setRows((r) => r?.map((x) => (x.id === id ? updated : x)) ?? null);
      toast.show({ kind: 'saved', message: 'Saved' });
    } catch {
      toast.show({ kind: 'error', message: 'Could not save. Try again.' });
    }
  }

  function withdraw(id: number) {
    scheduleFuseAction('withdraw', id);
    toast.show({
      kind: 'withdrawn',
      message: 'Withdrawn from the public site',
      action: { label: 'Undo', onClick: () => cancelFuseAction([id]) },
    });
  }

  const visible = rows === null ? null : rows.filter((r) => !hidden.has(r.id));

  return (
    <section aria-label="Content management">
      {visible === null ? (
        <p className="text-[14px] text-ink-soft" aria-live="polite">…</p>
      ) : visible.length === 0 ? (
        <p className="max-w-[60ch] text-[16px] text-ink-soft">
          No published programs yet. Approve items from the Review list. {/* copy deck */}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-mist bg-surface">
          <table className="w-full min-w-[1080px] border-collapse text-left">
            <thead>
              <tr className="border-b border-mist text-[13px] font-semibold text-ink-soft">
                <th scope="col" className="px-3 py-3">Program</th>
                <th scope="col" className="px-3 py-3">Summary</th>
                <th scope="col" className="px-3 py-3">Website</th>
                <th scope="col" className="px-3 py-3">Audience</th>
                <th scope="col" className="px-3 py-3">Dates</th>
                <th scope="col" className="px-3 py-3">Category</th>
                <th scope="col" className="px-3 py-3">Withdraw</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mist">
              {visible.map((e) => (
                <tr key={e.id} className="group/row align-top hover:bg-canvas/60">
                  {editing?.id === e.id && editing.field === 'name' ? (
                    <td className="p-2">
                      <InlineInput
                        initial={e.name}
                        ariaLabel="Edit program name"
                        onSave={(v) => {
                          setEditing(null);
                          if (v && v !== e.name) void patch(e.id, { name: v });
                        }}
                        onCancel={() => setEditing(null)}
                      />
                    </td>
                  ) : (
                    <EditableCell label="program name" onEdit={() => setEditing({ id: e.id, field: 'name' })}>
                      <span className="block text-[14px] font-semibold text-ink">{e.name}</span>
                    </EditableCell>
                  )}

                  {editing?.id === e.id && editing.field === 'summary' ? (
                    <td className="p-2">
                      <InlineInput
                        initial={e.summary}
                        multiline
                        ariaLabel="Edit summary"
                        onSave={(v) => {
                          setEditing(null);
                          if (v && v !== e.summary) void patch(e.id, { summary: v });
                        }}
                        onCancel={() => setEditing(null)}
                      />
                    </td>
                  ) : (
                    <EditableCell label="summary" onEdit={() => setEditing({ id: e.id, field: 'summary' })}>
                      <span className="line-clamp-3 block max-w-[38ch] text-[13px] text-ink-soft">{e.summary}</span>
                    </EditableCell>
                  )}

                  {editing?.id === e.id && editing.field === 'url' ? (
                    <td className="p-2">
                      <InlineInput
                        initial={e.url}
                        ariaLabel="Edit website"
                        onSave={(v) => {
                          setEditing(null);
                          if (v && v !== e.url) void patch(e.id, { url: v });
                        }}
                        onCancel={() => setEditing(null)}
                      />
                    </td>
                  ) : (
                    <EditableCell label="website" onEdit={() => setEditing({ id: e.id, field: 'url' })}>
                      <span className="block max-w-[24ch] truncate text-[13px] text-ink-soft" title={e.url}>
                        {domain(e.url)}
                      </span>
                    </EditableCell>
                  )}

                  {editing?.id === e.id && editing.field === 'audience' ? (
                    <td className="p-2">
                      <TagInput
                        initial={e.audience}
                        onSave={(v) => {
                          setEditing(null);
                          void patch(e.id, { audience: v });
                        }}
                        onCancel={() => setEditing(null)}
                      />
                    </td>
                  ) : (
                    <EditableCell label="audience" onEdit={() => setEditing({ id: e.id, field: 'audience' })}>
                      <span className="flex max-w-[22ch] flex-wrap gap-1">
                        {e.audience.map((t) => (
                          <span
                            key={t}
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-semibold"
                            style={{ background: 'color-mix(in oklab, var(--ink) 7%, white)', color: 'var(--ink-soft)' }}
                          >
                            {t}
                          </span>
                        ))}
                      </span>
                    </EditableCell>
                  )}

                  <td className="px-3 py-2">
                    <span className="num block whitespace-nowrap text-[13px] text-ink-soft">
                      {formatDateRange(e.startsAt, e.endsAt) || '\u00A0'}
                    </span>
                  </td>

                  <td className="px-3 py-2">
                    <div className="mt-1">
                      <CategoryPicker
                        value={e.category}
                        onChange={(c: CategoryId) => void patch(e.id, { category: c })}
                      />
                    </div>
                  </td>

                  <td className="px-3 py-2">
                    <div className="mt-1">
                      <FuseAction
                        label="Withdraw"
                        undoLabel="Undo"
                        variant="neutral"
                        onCommit={() => withdraw(e.id)}
                        onUndo={() => cancelFuseAction([e.id])}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-6 text-[13px] text-ink-soft">
        Published programs appear on the public site immediately. {/* ⚑ copy */}
      </p>
    </section>
  );
}
