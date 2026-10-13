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
 * Content management tab — client revision 3 layout (same full-info table as
 * the review list: Category column, wrapped dates, Notes + Image URL columns,
 * sticky search + header; Withdraw action).
 */
export function ContentManagementTab() {
  const toast = useToast();
  const { refresh } = useAdminSummary();
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [editing, setEditing] = useState<{ id: number; field: EditableField } | null>(null);
  const [query, setQuery] = useState('');
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

  const searched =
    rows === null
      ? null
      : query.trim()
        ? rows.filter((r) => r.name.toLowerCase().includes(query.trim().toLowerCase()))
        : rows;
  const visible = searched === null ? null : searched.filter((r) => !hidden.has(r.id));

  return (
    <section
      aria-label="Content management"
      className="flex h-[calc(100vh-56px-48px)] min-h-[320px] flex-col"
    >
      {/* sticky search (request 3d) */}
      <div className="sticky z-20 -mx-1 mb-3 bg-canvas px-1 pb-2 pt-3" style={{ top: 56 }}>
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
          {query.trim()
            ? 'No programs match your search.'
            : 'No published programs yet. Approve items from the Review list.' /* copy deck */}
        </p>
      ) : (
        <div className="review-table-scroll min-h-[200px] flex-1 rounded-xl border border-mist bg-surface">
          <table className="w-full min-w-[1460px] border-collapse text-left">
            <thead>
              <tr className="text-[13px] font-semibold text-ink-soft">
                {[
                  'Program',
                  'Category',
                  'Application Timeline',
                  'Web Link',
                  'Eligibility',
                  'Overview',
                  'Image URL',
                  'Notes',
                  'Withdraw',
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

                  <td className="min-w-[130px] px-3 py-2">
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
