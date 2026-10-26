import type { Entry, EntryDraft, PendingUpdate, Scope, SearchStats, UpdateDiffItem } from '../../../shared/types';

/**
 * Provider seams (01-architecture.md §4). Real implementations are future
 * drop-in replacements; nothing outside this folder may know they are mocks.
 */

/** One page found by a search source, before dedup/extraction. */
export interface RawHit {
  title: string;
  url: string;
  snippet: string;
}

/** Condensed view of an entry already in the DB, for entity dedup. */
export interface ExistingEntryRef {
  id: number;
  name: string;
  url: string;
  summary: string;
  category: string;
  status: 'review' | 'published' | 'removed' | 'withdrawn';
}

/** Everything a provider needs to know about the DB state for one round. */
export interface SearchContext {
  /** Raw urls as stored; normalization is the provider's job. */
  existingUrls: Set<string>;
  existingEntries: ExistingEntryRef[];
  /**
   * Queries used by the last few search rounds (most recent first, deduped).
   * The query planner avoids repeating these so consecutive rounds with the
   * same prompt don't re-find the same URLs.
   */
  recentQueries: string[];
  /**
   * The candidate is the SAME program as `existing`, on a newer page
   * (e.g. .../2027 instead of .../2026). The route layer decides what to do
   * (published entries get a pending url-diff → Check updates tab).
   */
  onSameProgramEdition?(candidate: { name: string; url: string }, existing: ExistingEntryRef): void;
  /** Called once with funnel counters before the promise resolves. */
  onStats?(stats: SearchStats): void;
}

export interface SearchProvider {
  /** Returns 0–30 drafts; must NOT contain any URL already present in the DB (any status). */
  search(prompt: string, scope: Scope, ctx: SearchContext): Promise<EntryDraft[]>;
}

export interface UpdateDraft {
  entryId: number;
  diff: UpdateDiffItem[];
}

export interface UpdateChecker {
  /** Returns diffs for published entries. Real checker re-reads managed sites. */
  check(entries: Entry[]): Promise<UpdateDraft[]>;
}

export type { PendingUpdate };
