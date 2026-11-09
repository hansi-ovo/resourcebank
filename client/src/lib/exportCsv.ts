import type { Entry } from 'shared/types';
import { categoryMeta } from 'shared/types';
import { formatDateRange } from '@/lib/format';

/**
 * CSV export (client sheet export request): the admin checks rows on the
 * Review list / Content management tables and downloads them as a
 * spreadsheet. Zero dependencies — a UTF-8 (BOM) CSV that Excel / WPS /
 * Numbers open with correct non-ASCII rendering; RFC-4180 quoting.
 */

/** Quote a cell iff it contains a comma, quote, CR or LF (RFC 4180). */
function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Sheet columns — the client's table (调试.md) + the two admin-only columns. */
const HEADERS = [
  'Programs',
  'Web Links',
  'Overview',
  'Category',
  'Eligibility',
  'Application Timeline',
  'Image URL',
  'Notes',
];

function entryRow(e: Entry): string[] {
  return [
    e.name,
    e.url,
    e.summary,
    categoryMeta(e.category).label,
    e.audience.join('; '),
    formatDateRange(e.startsAt, e.endsAt) || e.timeline,
    e.imageUrl ?? '',
    e.notes ?? '',
  ];
}

/** Build the CSV text for the given entries (headers first). */
export function buildEntriesCsv(entries: Entry[]): string {
  const lines = [HEADERS, ...entries.map(entryRow)].map((row) => row.map(csvCell).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/** Trigger a "save file" download of the CSV to the admin's computer. */
export function downloadEntriesCsv(kind: 'review' | 'published', entries: Entry[]): void {
  const blob = new Blob([buildEntriesCsv(entries)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${kind === 'review' ? 'review-list' : 'content-management'}-${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
