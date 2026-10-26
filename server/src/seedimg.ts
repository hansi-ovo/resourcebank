import type { EntryDraft } from '../../shared/types';

const C = {
  'on-campus': '#3E7A5C',
  fellowships: '#33605B',
  experiential: '#336472',
  events: '#3F5F85',
  training: '#465891',
} as const;

function tile(cat: keyof typeof C, label: string): string {
  const c = C[cat];
  const escaped = label.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
  <rect width="960" height="540" fill="url(#g)"/>
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c}" stop-opacity="0.92"/>
      <stop offset="1" stop-color="${c}" stop-opacity="0.68"/>
    </linearGradient>
  </defs>
  <circle cx="820" cy="80" r="180" fill="#ffffff" fill-opacity="0.07"/>
  <circle cx="120" cy="470" r="240" fill="#ffffff" fill-opacity="0.05"/>
  <text x="48" y="492" font-family="Georgia, 'Times New Roman', serif" font-size="200" font-weight="200" fill="#ffffff" fill-opacity="0.22">${escaped.slice(0, 1)}</text>
  <text x="48" y="96" font-family="'Segoe UI', Arial, sans-serif" font-size="28" font-weight="500" fill="#ffffff" fill-opacity="0.85">DKU Leadership Resource Bank</text>
  <text x="48" y="130" font-family="'Segoe UI', Arial, sans-serif" font-size="17" fill="#ffffff" fill-opacity="0.6">${escaped}</text>
</svg>`;
}

export const PLACEHOLDERS: Record<string, string> = {
  'on-campus.svg': tile('on-campus', 'On-Campus Opportunities'),
  'fellowships.svg': tile('fellowships', 'Fellowships'),
  'experiential.svg': tile('experiential', 'Experiential Programs'),
  'events.svg': tile('events', 'Event & Conference'),
  'training.svg': tile('training', 'Training Programs'),
};

/**
 * Maps an entry draft's imageUrl onto the servable form:
 * - `/seed/<file>.svg` (seed data) → the category-keyed `/api/seedimg/...` route.
 * - null/absent (every search-extracted draft) → the category's placeholder
 *   art, so no entry ever reaches the DB imageless.
 * - external http(s) URLs pass through unchanged.
 * Unknown category strings fall back to the generic events art (better than
 * dropping the image entirely; categories are validated upstream anyway).
 */
export function placeholderFor(seedUrl: string | null, category: string): string | null {
  if (seedUrl) {
    const external = /^https?:\/\//i.test(seedUrl);
    if (external) return seedUrl;
    const m = /\/seed\/([a-z-]+\.svg)$/.exec(seedUrl);
    if (m) return `/api/seedimg/${category}/${m[1]}`;
  }
  // null or unparseable — fall back to the category's placeholder art.
  const cat = (category in C ? category : 'events') as keyof typeof C;
  return `/api/seedimg/${cat}/${cat}.svg`;
}

export function placeholderBody(cat: string, file: string): { body: string; type: string } | null {
  const t = PLACEHOLDERS[file];
  if (!t) return null;
  return { body: t, type: 'image/svg+xml; charset=utf-8' };
}
