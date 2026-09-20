import { useEffect, useId, useRef, useState } from 'react';
import type { Entry } from 'shared/types';
import { formatDateRange, displayImageUrl } from '@/lib/format';

/** Dates line: ISO date range when present, else the client sheet's free-text
 *  application timeline (e.g. "Session 3 Week 6 - Session 4 Week 1"). */
function datesText(entry: Entry): string {
  const range = formatDateRange(entry.startsAt, entry.endsAt);
  if (range) return range;
  return (entry.timeline ?? '').replace(/\n/g, ' · ');
}
import { CloseIcon } from '@/features/admin/icons';
import './EntryModal.css';

/**
 * EntryModal (02-design-system §5): 720px max, image top (tonal fallback),
 * name, summary, audience chips, dates row, "Visit website" (new tab,
 * rel=noopener), × top-right (32px hit). Focus trap; Escape/outside close;
 * body scroll locked; focus restored on close.
 */
export function EntryModal({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [imgBroken, setImgBroken] = useState(false);
  const datesLine = datesText(entry);

  // focus trap + key handling
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const prevFocus = document.activeElement as HTMLElement | null;
    (el.querySelector<HTMLElement>('[data-modal-close]') ?? el).focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === 'Tab') {
        const focusables = el.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    el.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      el.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
      prevFocus?.focus();
    };
  }, [onClose]);

  const tint = `var(--cat-${entry.category})`;

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="modal-card"
        data-cat={entry.category}
        style={{ ['--cat' as string]: tint }}
      >
        {/* sticky close row: pinned to the card's top-right even when the
            content scrolls (request 2.3) */}
        <div className="modal-close-row">
          <button
            type="button"
            data-modal-close
            className="modal-close"
            aria-label="Close"
            onClick={onClose}
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="modal-image" aria-hidden={!entry.imageUrl || imgBroken}>
          {entry.imageUrl && !imgBroken ? (
            <img
              src={displayImageUrl(entry.imageUrl) ?? undefined}
              alt=""
              onError={() => setImgBroken(true)}
            />
          ) : (
            <span className="modal-fallback">{entry.name.slice(0, 1)}</span>
          )}
        </div>

        <div className="modal-body">
          <h2 id={titleId} className="modal-title">
            {entry.name}
          </h2>
          <p className="modal-summary">{entry.summary}</p>

          <div className="modal-chips">
            {entry.audience.map((t) => (
              <span key={t} className="modal-chip">
                {t}
              </span>
            ))}
          </div>

          <p className="modal-dates num">{datesLine}</p>

          <a
            className="modal-visit"
            href={entry.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Visit website
          </a>
        </div>
      </div>
    </div>
  );
}
