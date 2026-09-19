import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Right-click context menu for cell editing (D9):
 * right-click on an editable cell → `Edit` item.
 * Positioned at cursor; closes on click-away/Escape/scroll.
 */
export function ContextMenu({
  open,
  x,
  y,
  onClose,
  onEdit,
}: {
  open: boolean;
  x: number;
  y: number;
  onClose: () => void;
  onEdit: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onClose, true);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-50 min-w-[140px] rounded-lg border border-mist bg-surface py-1 shadow-[0_12px_32px_rgba(26,43,42,0.16)]"
      style={{ left: Math.min(x, window.innerWidth - 160), top: Math.min(y, window.innerHeight - 60) }}
    >
      <button
        type="button"
        role="menuitem"
        className="block w-full px-3 py-1.5 text-left text-[14px] text-ink hover:bg-canvas focus-visible:outline-2"
        style={{ outlineColor: 'var(--focus)' }}
        onClick={() => {
          onClose();
          onEdit();
        }}
      >
        Edit
      </button>
    </div>
  );
}

/** Wrap a table cell to add the D9 affordances: context menu + dblclick + hidden keyboard Edit. */
export function EditableCell({
  onEdit,
  children,
  className,
  label,
}: {
  onEdit: () => void;
  children: ReactNode;
  className?: string;
  label: string;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  return (
    <td
      className={cn('relative p-0', className)}
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
      onDoubleClick={onEdit}
    >
      <div className="flex min-h-[56px] items-center px-3 py-2">
        <div className="min-w-0 flex-1">{children}</div>
        <button
          type="button"
          className="ml-2 rounded px-1 text-[12px] opacity-0 transition-opacity focus-visible:opacity-100 group-hover/row:opacity-60 hover:!opacity-100"
          aria-label={`Edit ${label}`}
          onClick={onEdit}
        >
          Edit
        </button>
      </div>
      <ContextMenu
        open={menu !== null}
        x={menu?.x ?? 0}
        y={menu?.y ?? 0}
        onClose={() => setMenu(null)}
        onEdit={onEdit}
      />
    </td>
  );
}

/** Inline text editor: Enter saves, Escape cancels (03-pages §Review list). */
export function InlineInput({
  initial,
  onSave,
  onCancel,
  multiline,
  ariaLabel,
}: {
  initial: string;
  onSave: (v: string) => void;
  onCancel: () => void;
  multiline?: boolean;
  ariaLabel: string;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  useEffect(() => ref.current?.focus(), []);

  const common = {
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setValue(e.target.value),
    onBlur: () => (value.trim() ? onSave(value.trim()) : onCancel()),
    className:
      'w-full rounded-md border px-2 py-1.5 text-[14px] text-ink bg-surface focus-visible:outline-2',
    style: { borderColor: 'var(--focus)', outlineColor: 'var(--focus)' },
    'aria-label': ariaLabel,
  };

  if (multiline) {
    return (
      <textarea
        {...common}
        ref={ref as React.RefObject<HTMLTextAreaElement>}
        rows={3}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onCancel();
          }
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSave(value.trim());
        }}
      />
    );
  }
  return (
    <input
      {...common}
      ref={ref as React.RefObject<HTMLInputElement>}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSave(value.trim());
        if (e.key === 'Escape') {
          e.stopPropagation();
          onCancel();
        }
      }}
    />
  );
}

/** Audience tag input: Enter adds, Backspace removes chip (03-pages §Review list). */
export function TagInput({
  initial,
  onSave,
  onCancel,
}: {
  initial: string[];
  onSave: (v: string[]) => void;
  onCancel: () => void;
}) {
  const [tags, setTags] = useState(initial);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => inputRef.current?.focus(), []);

  function add() {
    const v = draft.trim();
    if (v && !tags.includes(v)) setTags([...tags, v]);
    setDraft('');
  }

  return (
    <div
      className="w-full rounded-md border bg-surface p-1.5 focus-within:outline-2"
      style={{ borderColor: 'var(--focus)', outlineColor: 'var(--focus)' }}
      aria-label="Edit audience"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[13px] font-semibold"
            style={{ background: 'color-mix(in oklab, var(--ink) 7%, white)', color: 'var(--ink-soft)' }}
          >
            {t}
            <button
              type="button"
              aria-label={`Remove ${t}`}
              onClick={() => setTags(tags.filter((x) => x !== t))}
              className="rounded-full px-1 hover:opacity-70"
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            } else if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
              setTags(tags.slice(0, -1));
            } else if (e.key === 'Escape') {
              e.stopPropagation();
              onCancel();
            } else if (e.key === 'Enter' && e.ctrlKey) {
              onSave(tags);
            }
          }}
          placeholder="Add a tag and press Enter"
          aria-label="Add audience tag"
          className="min-w-[160px] flex-1 bg-transparent px-1 text-[14px] text-ink outline-none placeholder:text-ink-soft/60"
        />
      </div>
      <div className="mt-1.5 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded px-2 py-1 text-[13px] text-ink-soft hover:opacity-80">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSave(tags)}
          className="rounded px-2 py-1 text-[13px] font-semibold text-white"
          style={{ background: 'var(--ramp-mid)' }}
        >
          Save
        </button>
      </div>
    </div>
  );
}
