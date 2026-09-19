/**
 * Date + domain formatting per copy deck (03-pages-spec.md):
 * - program dates: `MMM D, YYYY` (e.g. Mar 15, 2027)
 * - ranges: `MMM D – MMM D, YYYY` (Jan 12 – Mar 15, 2027)
 * - last search: `MMM D, YYYY HH:mm` (tabular numerals via .num class)
 * - unknown values render as nothing
 */

const UTC = { timeZone: 'UTC' } as const;

const dateFmt = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  ...UTC,
});
const monthDayFmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', ...UTC });

function parse(dateish: string | null | undefined): Date | null {
  if (!dateish) return null;
  const d = new Date(dateish.length === 10 ? `${dateish}T00:00:00Z` : dateish);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatProgramDate(dateish: string | null | undefined): string {
  const d = parse(dateish);
  return d ? dateFmt.format(d) : '';
}

export function formatDateRange(startsAt?: string | null, endsAt?: string | null): string {
  const s = parse(startsAt);
  const e = parse(endsAt);
  if (s && e) {
    return s.getUTCFullYear() === e.getUTCFullYear()
      ? `${monthDayFmt.format(s)} – ${dateFmt.format(e)}`
      : `${monthDayFmt.format(s)}, ${s.getUTCFullYear()} – ${dateFmt.format(e)}`;
  }
  if (s) return dateFmt.format(s);
  if (e) return dateFmt.format(e);
  return '';
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad2 = (n: number) => String(n).padStart(2, '0');

/** `MMM D, YYYY HH:mm` — 24h, tabular numerals come from CSS `.num`. */
export function formatStamp(iso: string | null | undefined): string {
  const d = parse(iso);
  if (!d) return '';
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
}

export function domain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
