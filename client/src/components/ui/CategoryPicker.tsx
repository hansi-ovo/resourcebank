import { useState } from 'react';
import { CATEGORIES, type CategoryId } from 'shared/types';
import { cn } from '@/lib/utils';

/**
 * Category picker: chip + `Change` opens a 5-option radio list
 * (03-pages §Review list). Renders as a popover anchored under the chip.
 */
export function CategoryPicker({
  value,
  onChange,
}: {
  value: CategoryId;
  onChange: (c: CategoryId) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = CATEGORIES.find((c) => c.id === value)!;

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <span
          data-cat={value}
          className="chip-cat chip-cat-100"
          style={{ ['--cat' as string]: current.tint }}
        >
          {current.label}
        </span>
        <button
          type="button"
          className="text-[13px] text-ink-soft underline underline-offset-2 hover:text-ink"
          aria-expanded={open}
          aria-haspopup="listbox"
          onClick={() => setOpen((o) => !o)}
        >
          Change
        </button>
      </div>

      {open ? (
        <div
          role="listbox"
          aria-label="Change category"
          className="absolute left-0 top-[calc(100%+6px)] z-30 w-64 rounded-xl border border-mist bg-surface p-2 shadow-[0_12px_32px_rgba(26,43,42,0.16)]"
        >
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              role="option"
              aria-selected={c.id === value}
              onClick={() => {
                onChange(c.id);
                setOpen(false);
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[14px] text-ink transition-colors hover:bg-canvas focus-visible:outline-2',
              )}
              style={{ outlineColor: 'var(--focus)' }}
            >
              <span
                aria-hidden
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: c.tint }}
              />
              <span className="flex-1">{c.label}</span>
              {c.id === value ? (
                <span aria-hidden className="text-[13px]" style={{ color: c.tint }}>
                  ●
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
