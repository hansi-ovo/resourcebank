import type { Entry, UpdateDiffItem } from '../../../shared/types';
import type { UpdateChecker, UpdateDraft } from './types';

/**
 * MockUpdateChecker (01-architecture.md §4, D11):
 * - scheduled check returns no changes (real checker would re-read sites)
 * - injectDemo(n) produces 2–3 believable diffs on published entries,
 *   deterministically picked; the demo action reuses the same insertion
 *   path a real checker would take.
 */

const DAY = 24 * 60 * 60 * 1000;

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function shiftDays(dateStr: string, days: number): string {
  return iso(new Date(new Date(`${dateStr}T00:00:00Z`).getTime() + days * DAY));
}

export class MockUpdateChecker implements UpdateChecker {
  /** Deterministic counter so repeated demo clicks rotate through entries. */
  private demoCursor = 0;

  async check(_entries: Entry[]): Promise<UpdateDraft[]> {
    // v1: the real diffing logic is out of scope — scheduled checks find nothing.
    return [];
  }

  /**
   * Produces n (2–3) believable pending diffs for published entries.
   * Each diff: shifted deadline OR new start date OR audience tag added,
   * with a one-line note.
   */
  injectDemo(entries: Entry[], n: number): UpdateDraft[] {
    const published = entries.filter((e) => e.status === 'published');
    if (published.length === 0) return [];

    const kinds = ['deadline-shift', 'start-date', 'audience-tag'] as const;
    const out: UpdateDraft[] = [];
    for (let i = 0; i < Math.min(n, published.length); i++) {
      const entry = published[(this.demoCursor + i) % published.length];
      const kind = kinds[i % kinds.length];
      const diff: UpdateDiffItem[] = [];

      if (kind === 'deadline-shift' && entry.endsAt) {
        const to = shiftDays(entry.endsAt, 14);
        const pretty = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
        diff.push({
          field: 'endsAt',
          from: entry.endsAt,
          to,
          note: `Deadline moved from ${pretty(entry.endsAt)} to ${pretty(to)} per program page`,
        });
      } else if (kind === 'start-date') {
        const base = entry.startsAt ?? iso(new Date());
        const to = shiftDays(base, 21);
        diff.push({
          field: 'startsAt',
          from: entry.startsAt ?? '',
          to,
          note: `Start date announced as ${to}`,
        });
      } else {
        const tag = 'First-generation students';
        if (!entry.audience.includes(tag)) {
          const nextAudience = [...entry.audience, tag];
          diff.push({
            field: 'audience',
            from: JSON.stringify(entry.audience),
            to: JSON.stringify(nextAudience),
            note: 'Audience expanded to include first-generation students',
          });
        }
      }

      if (diff.length > 0) out.push({ entryId: entry.id, diff });
    }
    this.demoCursor += n;
    return out;
  }
}
