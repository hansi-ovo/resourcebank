import type { Entry, EntryDraft, PendingUpdate, Scope, UpdateDiffItem } from '../../../shared/types';

/**
 * Provider seams (01-architecture.md §4). Real implementations are future
 * drop-in replacements; nothing outside this folder may know they are mocks.
 */

export interface SearchProvider {
  /** Returns 0–30 drafts; must NOT contain any URL already present in the DB (any status). */
  search(prompt: string, scope: Scope, existingUrls: Set<string>): Promise<EntryDraft[]>;
}

export interface UpdateDraft {
  entryId: number;
  diff: UpdateDiffItem[];
}

export interface UpdateChecker {
  /** Returns diffs for published entries. Real checker re-reads managed sites. */
  check(entries: Entry[]): Promise<UpdateDraft[]>;
}
