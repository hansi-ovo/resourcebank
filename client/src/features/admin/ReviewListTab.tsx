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

type EditableField = 'name' | 'summary' | 'url' | 'audience' | 'notes' | 'imageUrl' | 'timeline';

/**
 * Review list tab — client revision 3 layout: every project row shows its
 * COMPLETE information (full summary, wrapped dates, visible Category column,
 * new Notes + Image URL inline-editable columns); sticky search box + sticky
 * table header; name search (request 3c/3d/3e).
 */
export function ReviewListTab() {
  const toast = useToast();
  const { refresh } = useAdminSummary();
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<{ id: number; field: EditableField } | null>(null);
  const [query, setQuery] = useState('');
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

  const searched =
    rows === null
      ? null
      : query.trim()
        ? rows.filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase()))
        : rows;
  const visible = searched === null ? null : searched.filter((r) => !hidden.has(r.id));
  const allChecked = visible !== null && visible.length > 0 && selected.size === visible.length;

  return (
    <section
      aria-label="Review list"
      className="flex h-[calc(100vh-56px-48px)] min-h-[320px] flex-col"
    >
      {/* sticky toolbar: search box (request 3d) directly under the top bar */}
      <div
        className="sticky top-[56px] z-20 -mx-1 mb-3 bg-canvas px-1 pb-2 pt-3"
        style={{ top: 56 }}
      >
        <div className="flex items-center gap-3">
          <input
            type="search"
            aria-label="Search programs"
            placeholder="Search programs by name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-80 rounded-lg border border-mist bg-surface px-3 py-2 text-[14px] text-ink placeholder:text-ink-soft/60 focus-visible:outline-2"
            style={{ outlineColor: 'var(--focus)' }}
          />
          {visible !== null ? (
            <span className="num text-[13px] text-ink-soft">{visible.length} items</span>
          ) : null}
        </div>
      </div>

      {visible === null ? (
        <p className="text-[14px] text-ink-soft" aria-live="polite">…</p>
      ) : visible.length === 0 ? (
        <p className="max-w-[60ch] text-[16px] text-ink-soft">
          {query.trim() ? 'No programs match your search.' : 'Nothing to review. Run a search to find new programs.' /* ⚑ copy */}
        </p>
      ) : (
        <>
          {selected.size > 0 ? (
            <div className="mb-3 flex items-center gap-3 rounded-xl border border-mist bg-surface px-4 py-3">
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

          <div className="review-table-scroll min-h-[200px] flex-1 rounded-xl border border-mist bg-surface">
            <table className="w-full min-w-[1460px] border-collapse text-left">
              <thead>
                <tr className="text-[13px] font-semibold text-ink-soft">
                  <th
                    scope="col"
                    className="sticky z-10 w-10 border-b border-mist bg-surface px-3 py-3"
                    style={{ top: 0, left: 0 }}
                  >
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
                  {[
                    'Program',
                    'Category',
                    'Application Timeline',
                    'Web Link',
                    'Eligibility',
                    'Overview',
                    'Image URL',
                    'Notes',
                    'Actions',
                  ].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="sticky z-10 border-b border-mist bg-surface px-3 py-3"
                      style={{ top: 0 }}
                    >
                      {h}
                    </th>
                  ))}
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
                      <td className="min-w-[170px] p-2">
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
                      <EditableCell label="program name" className="min-w-[170px]" onEdit={() => setEditing({ id: e.id, field: 'name' })}>
                        <span className="block break-words text-[14px] font-semibold text-ink">{e.name}</span>
                      </EditableCell>
                    )}

                    <td className="min-w-[120px] px-3 py-2">
                      <div className="mt-1">
                        <CategoryPicker
                          value={e.category}
                          onChange={(c: CategoryId) => void patch(e.id, { category: c })}
                        />
                      </div>
                    </td>

                    {editing?.id === e.id && editing.field === 'timeline' ? (
                      <td className="min-w-[130px] p-2">
                        <InlineInput
                          initial={e.timeline}
                          multiline
                          ariaLabel="Edit application timeline"
                          onSave={(v) => {
                            setEditing(null);
                            if (v !== e.timeline) void patch(e.id, { timeline: v });
                          }}
                          onCancel={() => setEditing(null)}
                        />
                      </td>
                    ) : (
                      <EditableCell
                        label="application timeline"
                        className="min-w-[130px]"
                        onEdit={() => setEditing({ id: e.id, field: 'timeline' })}
                      >
                        <span className="num block whitespace-pre-wrap text-[13px] text-ink-soft">
                          {formatDateRange(e.startsAt, e.endsAt) ||
                            e.timeline.replace(/\n/g, ' ') ||
                            '\u00A0'}
                        </span>
                      </EditableCell>
                    )}

                    {editing?.id === e.id && editing.field === 'url' ? (
                      <td className="min-w-[120px] p-2">
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
                      <EditableCell label="website" className="min-w-[120px]" onEdit={() => setEditing({ id: e.id, field: 'url' })}>
                        <span className="block break-all text-[13px] text-ink-soft" title={e.url}>
                          {domain(e.url)}
                        </span>
                      </EditableCell>
                    )}

                    {editing?.id === e.id && editing.field === 'audience' ? (
                      <td className="min-w-[140px] p-2">
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
                      <EditableCell label="audience" className="min-w-[140px]" onEdit={() => setEditing({ id: e.id, field: 'audience' })}>
                        <span className="flex flex-wrap gap-1">
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
                        <span className="block max-w-[46ch] text-[13px] leading-snug text-ink-soft">{e.summary}</span>
                      </EditableCell>
                    )}

                    {editing?.id === e.id && editing.field === 'imageUrl' ? (
                      <td className="min-w-[140px] p-2">
                        <InlineInput
                          initial={e.imageUrl ?? ''}
                          ariaLabel="Edit image URL"
                          onSave={(v) => {
                            setEditing(null);
                            void patch(e.id, { imageUrl: v }); // '' clears
                          }}
                          onCancel={() => setEditing(null)}
                        />
                      </td>
                    ) : (
                      <EditableCell label="image URL" className="min-w-[140px]" onEdit={() => setEditing({ id: e.id, field: 'imageUrl' })}>
                        <span className="block max-w-[30ch] break-all text-[13px] leading-snug text-ink-soft" title={e.imageUrl ?? ''}>
                          {e.imageUrl || <span className="opacity-50">—</span>}
                        </span>
                      </EditableCell>
                    )}

                    {editing?.id === e.id && editing.field === 'notes' ? (
                      <td className="min-w-[140px] p-2">
                        <InlineInput
                          initial={e.notes}
                          multiline
                          ariaLabel="Edit notes"
                          onSave={(v) => {
                            setEditing(null);
                            void patch(e.id, { notes: v });
                          }}
                          onCancel={() => setEditing(null)}
                        />
                      </td>
                    ) : (
                      <EditableCell label="notes" className="min-w-[140px]" onEdit={() => setEditing({ id: e.id, field: 'notes' })}>
                        <span className="block max-w-[30ch] whitespace-pre-wrap text-[13px] leading-snug text-ink-soft">
                          {e.notes || <span className="opacity-50">—</span>}
                        </span>
                      </EditableCell>
                    )}

                    <td className="min-w-[170px] px-3 py-2">
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
