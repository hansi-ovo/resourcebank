import { SEED_ENTRIES } from '../../../shared/seed-data';
import type { EntryDraft, Scope } from '../../../shared/types';
import type { SearchProvider } from './types';

/**
 * MockSearchProvider (01-architecture.md §4, D10):
 * - filters the seed set by scope
 * - dedupes against ALL urls already in the DB (any status)
 * - scores: base 60 + 20 if scope-category match + 0–20 by prompt keyword hits
 *   (each unique prompt keyword found in name/summary adds 4, capped at 20)
 * - ties → earlier seed index; top 30 returned
 */

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'for', 'in', 'on', 'of', 'or', 'to', 'and', 'with', 'at', 'by',
  'is', 'are', 'be', 'near', 'into', 'over', 'about', 'find', 'me', 'some', 'any',
  'looking', 'want', 'need', 'please', 'like', 'programs', 'program', 'opportunities',
  'opportunity', 'site', 'sites', 'web', 'website', 'websites',
]);

function keywords(prompt: string): string[] {
  return [...new Set(
    prompt
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOP_WORDS.has(w)),
  )];
}

export class MockSearchProvider implements SearchProvider {
  async search(prompt: string, scope: Scope, existingUrls: Set<string>): Promise<EntryDraft[]> {
    const kw = keywords(prompt);
    const scored = SEED_ENTRIES.map((entry, index) => {
      let score = 60;
      if (scope !== 'all') {
        if (entry.category === scope) score += 20;
        else score -= 20; // out-of-scope candidates sink below in-scope ones
      }
      const hay = `${entry.name} ${entry.summary}`.toLowerCase();
      let hits = 0;
      for (const k of kw) if (hay.includes(k)) hits += 1;
      score += Math.min(20, hits * 4);
      return { entry, index, score };
    });

    return scored
      .filter((s) => !existingUrls.has(s.entry.url))
      .sort((a, b) => (b.score - a.score) || (a.index - b.index))
      .slice(0, 30)
      .map((s) => s.entry);
  }
}
