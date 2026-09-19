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
 * Review list tab (03-pages §Admin review). Undo semantics (client-level):
 * press optimistically hides the row; the server mutation only fires when the
 * 7s fuse window expires. Undo = cancel = nothing ever happened.
 */
export function ReviewListTab() {
  const toast = useToast();
  const { refresh } = useAdminSummary();
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<{ id: number; field: 'name' | 'summary' | 'url' | 'audience' } | null>(null);
  const hidden = useHiddenIds();

  const load = useCallback(async () => {
    try {
      setRows(await api.get<Entry[]>('/api/entries?status=review'));
    } catch {
      /* SSE retry covers this */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // when a queued action finally fires, refetch + refresh badges
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

  function act(action: 'approve' | 'remove', ids: number[]) {
    scheduleFuseAction(action, ids);
    setSelected((s) => new Set([...s].filter((x) => !ids.includes(x))));
    if (action === 'approve') {
      toast.show({
        kind: 'approved',
        message: ids.length > 1 ? `Approved ${ids.length} items` : 'Moved to Content management',
        action: { label: 'Undo', onClick: () => cancelFuseAction(ids) },
      });
    } else {
      toast.show({
        kind: 'removed',
        message: ids.length > 1 ? `Removed ${ids.length} items` : 'Removed',
        action: { label: 'Undo', onClick: () => cancelFuseAction(ids) },
      });
    }
  }

  const visible = rows === null ? null : rows.filter((r) => !hidden.has(r.id));
  const allChecked = visible !== null && visible.length > 0 && selected.size === visible.length;

  return (
    <section aria-label="Review list">
      {visible === null ? (
        <p className="text-[14px] text-ink-soft" aria-live="polite">…</p>
      ) : visible.length === 0 ? (
        <p className="max-w-[60ch] text-[16px] text-ink-soft">
          Nothing to review. Run a search to find new programs. {/* ⚑ copy */}
        </p>
      ) : (
        <>
          {selected.size > 0 ? (
            <div className="mb-4 flex items-center gap-3 rounded-xl border border-mist bg-surface px-4 py-3">
              <span className="num text-[14px] font-semibold text-ink">{selected.size} selected</span>
              <FuseAction
                label="Approve selected"
                undoLabel="Undo"
                variant="primary"
                onCommit={() => act('approve', [...selected])}
                onUndo={() => cancelFuseAction([...selected])}
              />
              <FuseAction
                label="Remove selected"
                undoLabel="Undo"
                variant="danger"
                onCommit={() => act('remove', [...selected])}
                onUndo={() => cancelFuseAction([...selected])}
              />
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-xl border border-mist bg-surface">
            <table className="w-full min-w-[1080px] border-collapse text-left">
              <thead>
                <tr className="border-b border-mist text-[13px] font-semibold text-ink-soft">
                  <th scope="col" className="sticky-col w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={allChecked}
                      onChange={(e) =>
                        setSelected(e.target.checked ? new Set(visible.map((r) => r.id)) : new Set())
                      }
                      className="h-4 w-4 accent-[color:var(--focus)]"
                    />
                  </th>
                  <th scope="col" className="px-3 py-3">Program</th>
                  <th scope="col" className="px-3 py-3">Summary</th>
                  <th scope="col" className="px-3 py-3">Website</th>
                  <th scope="col" className="px-3 py-3">Audience</th>
                  <th scope="col" className="px-3 py-3">Dates</th>
                  <th scope="col" className="px-3 py-3">Category</th>
                  <th scope="col" className="px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-mist">
                {visible.map((e) => (
                  <tr key={e.id} className="group/row align-top hover:bg-canvas/60">
                    <td className="sticky-col px-3 py-2">
                      <input
                        type="checkbox"
                        aria-label={`Select ${e.name}`}
                        checked={selected.has(e.id)}
                        onChange={(ev) => {
                          const next = new Set(selected);
                          if (ev.target.checked) next.add(e.id);
                          else next.delete(e.id);
                          setSelected(next);
                        }}
                        className="mt-3 h-4 w-4 accent-[color:var(--focus)]"
                      />
                    </td>

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
                        {formatDateRange(e.startsAt, e.endsAt) || (e.timeline ?? '').replace(/\n/g, ' ') || '\u00A0'}
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
                      <div className="mt-1 flex items-center gap-2">
                        <FuseAction
                          label="Approve"
                          undoLabel="Undo"
                          variant="primary"
                          onCommit={() => act('approve', [e.id])}
                          onUndo={() => cancelFuseAction([e.id])}
                        />
                        <FuseAction
                          label="Remove"
                          undoLabel="Undo"
                          variant="danger"
                          onCommit={() => act('remove', [e.id])}
                          onUndo={() => cancelFuseAction([e.id])}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
