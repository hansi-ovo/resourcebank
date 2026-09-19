/**
 * Shared domain types — the single source of truth for client + server.
 */

export const CATEGORY_IDS = [
  'on-campus',
  'fellowships',
  'experiential',
  'events',
  'training',
] as const;

export type CategoryId = (typeof CATEGORY_IDS)[number];

export interface CategoryMeta {
  id: CategoryId;
  label: string;
  tint: string; // tonal ramp hex, used for CSS var mapping + admin chip
}

/** Canonical category order (display + everywhere). */
export const CATEGORIES: CategoryMeta[] = [
  { id: 'on-campus', label: 'On-Campus Opportunities', tint: '#3E7A5C' },
  { id: 'fellowships', label: 'Fellowships', tint: '#33605B' },
  { id: 'experiential', label: 'Experiential Programs', tint: '#336472' },
  { id: 'events', label: 'Event & Conference', tint: '#3F5F85' },
  { id: 'training', label: 'Training Programs', tint: '#465891' },
];

export function categoryMeta(id: CategoryId): CategoryMeta {
  const m = CATEGORIES.find((c) => c.id === id);
  if (!m) throw new Error(`Unknown category: ${id}`);
  return m;
}

export type EntryStatus = 'review' | 'published' | 'removed' | 'withdrawn';
export type EntrySource = 'search' | 'update-apply';
export type Scope = 'all' | CategoryId;

export interface Entry {
  id: number;
  name: string;
  summary: string;
  url: string;
  audience: string[]; // free-form tags
  startsAt: string | null; // ISO date
  endsAt: string | null; // ISO date (deadline)
  category: CategoryId;
  imageUrl: string | null;
  quality: number | null; // mock AI confidence 1–100
  status: EntryStatus;
  source: EntrySource;
  createdAt: string;
  updatedAt: string;
}

/** A candidate produced by a SearchProvider before it becomes an Entry. */
export interface EntryDraft {
  name: string;
  summary: string;
  url: string;
  audience: string[];
  startsAt: string | null;
  endsAt: string | null;
  category: CategoryId;
  imageUrl: string | null;
  quality: number; // 1–100
}

export interface UpdateDiffItem {
  field: 'name' | 'summary' | 'url' | 'audience' | 'startsAt' | 'endsAt' | 'category' | 'imageUrl';
  from: string;
  to: string;
  note: string; // one human line, e.g. "Deadline moved from Mar 1 to Mar 15, 2027"
}

export interface PendingUpdate {
  id: number;
  entryId: number;
  entryName: string; // denormalized for list rendering
  diff: UpdateDiffItem[];
  detectedAt: string;
  status: 'pending' | 'applied' | 'discarded';
}

export type SearchJobStatus = 'running' | 'finished';

export interface SearchJob {
  id: number;
  prompt: string;
  scope: Scope;
  startedAt: string;
  finishedAt: string | null;
  resultCount: number | null;
  status: SearchJobStatus;
}

/** GET /api/summary payload. */
export interface AdminSummary {
  reviewCount: number;
  pendingUpdatesCount: number;
  lastSearchAt: string | null;
  searchRunning: boolean;
}

/** GET /api/published payload — grouped by canonical order. */
export interface PublishedSection {
  category: CategoryMeta;
  entries: Entry[];
}

/** PUT /api/entries/:id body — partial, at least one field. */
export interface EntryPatch {
  name?: string;
  summary?: string;
  url?: string;
  audience?: string[];
  category?: CategoryId;
}
