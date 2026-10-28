import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useEventStream } from '@/lib/sse';
import { startSearch } from '@/lib/searchRunner';
import { useToast } from '@/components/ui/Toast';
import { CatChip } from '@/components/ui/Chip';
import { Logo } from '@/components/ui/Logo';
import { domain, formatStamp } from '@/lib/format';
import { CATEGORIES, type AdminSummary, type Entry, type Scope } from 'shared/types';
import { SendIcon, SpinnerIcon, ChevronRightIcon } from './icons';

/**
 * `/admin` home (03-pages §Admin home). Copy deck verbatim; ⚑ items flagged.
 *
 * The client sends only the scope + the raw typed prompt — query planning
 * (category angles, diversity, include/exclude judgement) lives server-side
 * in the structured category specs. Tag-only search (empty input) is valid:
 * the selected scope's spec drives the planner.
 */
export function AdminHome() {
  const { signOut } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [pending, setPending] = useState<Entry[]>([]);
  const [prompt, setPrompt] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const [searching, setSearching] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [sum, review] = await Promise.all([
        api.get<AdminSummary>('/api/summary'),
        api.get<Entry[]>('/api/entries?status=review'),
      ]);
      setSummary(sum);
      setPending(review.slice(0, 5));
    } catch {
      /* SSE retries land here; next event re-refreshes */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEventStream(
    () => void refresh(),
    () => void refresh(),
  );

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    // Scope + raw prompt only; empty input = tag-only search (server plans
    // from the category spec). The finish toast fires from the global
    // listener in AdminApp — the runner keeps polling even if the admin
    // navigates away mid-search.
    if (searching) return;
    setSearching(true);
    await startSearch(prompt.trim(), scope).catch(() => {
      toast.show({ kind: 'error', message: 'Search failed. Try again.' });
    });
    // refresh what this page shows (Last search line, summary, pending)
    const [sum, review] = await Promise.all([
      api.get<AdminSummary>('/api/summary'),
      api.get<Entry[]>('/api/entries?status=review'),
    ]).catch(() => [null, null] as const);
    if (sum && review) {
      setSummary(sum);
      setPending(review.slice(0, 5));
    } else {
      await refresh();
    }
    setSearching(false);
  }

  return (
    <div className="min-h-screen bg-canvas">
      <header className="flex items-center justify-between px-8 py-5">
        <Logo to="/admin" />
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void signOut()}
            className="rounded-lg border border-mist bg-surface px-4 py-2 text-[14px] font-semibold text-ink transition-colors hover:border-ink-soft/40"
          >
            Sign out
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="rounded-lg px-4 py-2 text-[14px] font-semibold text-white transition-transform duration-150 hover:brightness-110 active:scale-[0.98]"
            style={{ background: 'var(--ramp-mid)' }}
          >
            View site
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1200px] px-8 pb-20">
        <h1 className="font-display text-[clamp(32px,4.4vw,40px)] font-semibold text-ink">
          Hi, admin :)
        </h1>

        <section aria-label="Search" className="mt-10">
          <form onSubmit={runSearch}>
            <label htmlFor="search-prompt" className="block text-[15px] font-medium text-ink">
              Search the web for programs
            </label>
            <div className="relative mt-3">
              <input
                id="search-prompt"
                className="w-full rounded-xl border border-mist bg-surface px-4 py-3.5 pr-12 text-[16px] text-ink placeholder:text-ink-soft/60 focus-visible:outline-2"
                style={{ outlineColor: 'var(--focus)' }}
                placeholder="Describe what to look for, e.g. leadership fellowships for undergraduates in Asia" /* ⚑ copy */
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={searching}
              />
              <button
                type="submit"
                className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-lg text-white disabled:cursor-wait"
                style={{ background: searching ? 'var(--ink-soft)' : 'var(--ramp-mid)' }}
                disabled={searching}
                aria-label={searching ? 'Searching' : 'Send search'}
                title={searching ? 'Searching' : `Search${prompt.trim() ? ' with your prompt' : ''} in ${scope === 'all' ? 'All' : CATEGORIES.find((c) => c.id === scope)?.label}`}
              >
                {searching ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : <SendIcon className="h-4 w-4" />}
              </button>
            </div>

            <div role="radiogroup" aria-label="Search scope" className="mt-3 flex flex-wrap gap-2">
              {(['all', ...CATEGORIES.map((c) => c.id)] as Scope[]).map((s) => {
                const label = s === 'all' ? 'All' : CATEGORIES.find((c) => c.id === s)!.label;
                const active = scope === s;
                return (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={searching}
                    onClick={() => setScope(s)}
                    className="rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors"
                    style={
                      active
                        ? { background: 'var(--ink)', color: 'white' }
                        : {
                            background: s === 'all' ? 'var(--mist)' : `color-mix(in oklab, ${CATEGORIES.find((c) => c.id === s)!.tint} 10%, white)`,
                            color: s === 'all' ? 'var(--ink)' : CATEGORIES.find((c) => c.id === s)!.tint,
                          }
                    }
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {searching ? (
              <p className="mt-3 text-[14px] text-ink-soft" aria-live="polite">
                Searching the web. This usually takes a few minutes.
              </p>
            ) : null}
          </form>
        </section>

        <section aria-label="Review summary" className="mt-12">
          {summary ? (
            <>
              <p className="text-[14px] text-ink-soft">
                {summary.reviewCount} items to review, {summary.pendingUpdatesCount} sites with unchecked updates {/* ⚑ copy (comma join) */}
              </p>
              {summary.lastSearchAt ? (
                <p className="num mt-1 text-[14px] text-ink-soft">
                  Last search: {formatStamp(summary.lastSearchAt)}
                </p>
              ) : null}

              {pending.length > 0 ? (
                <ul className="mt-4 divide-y divide-mist rounded-xl border border-mist bg-surface">
                  {pending.map((e, i) => (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => navigate('/admin/review/review-list')}
                        className="grid w-full grid-cols-[32px_1fr_1fr_auto] items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-canvas focus-visible:outline-2"
                        style={{ outlineColor: 'var(--focus)' }}
                      >
                        <span className="num text-[14px] text-ink-soft">{i + 1}</span>
                        <span className="truncate text-[14px] font-semibold text-ink">{e.name}</span>
                        <span className="truncate text-[14px] text-ink-soft" title={e.url}>
                          {domain(e.url)}
                        </span>
                        <CatChip category={e.category} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="mt-6 flex items-center gap-4">
                <Link
                  to="/admin/review/review-list"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-mist bg-surface px-4 py-2 text-[14px] font-semibold text-ink transition-colors hover:border-ink-soft/40"
                >
                  Go to review
                  <ChevronRightIcon className="h-4 w-4" aria-hidden />
                </Link>
                <Link
                  to="/admin/review/manual-add"
                  className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[14px] font-semibold text-white transition-all duration-150 hover:brightness-110 active:scale-[0.98]"
                  style={{ background: 'var(--ramp-mid)' }}
                >
                  Add manually
                </Link>
              </div>
            </>
          ) : (
            <p className="text-[14px] text-ink-soft" aria-live="polite">
              …
            </p>
          )}
        </section>
      </main>
    </div>
  );
}
