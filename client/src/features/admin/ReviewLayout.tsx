import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { api } from '@/lib/api';
import { useEventStream } from '@/lib/sse';
import { Logo } from '@/components/ui/Logo';
import { ChevronLeftIcon, ExternalIcon } from './icons';
import { ReviewListTab } from './ReviewListTab';
import { CheckUpdatesTab } from './CheckUpdatesTab';
import { ContentManagementTab } from './ContentManagementTab';
import type { AdminSummary } from 'shared/types';
import { cn } from '@/lib/utils';

export const REVIEW_TABS = [
  { id: 'review-list', label: 'Review list', count: 'reviewCount' as const },
  { id: 'check-updates', label: 'Check updates', count: 'pendingUpdatesCount' as const },
  { id: 'content-management', label: 'Content management', count: null },
] as const;

export type ReviewTabId = (typeof REVIEW_TABS)[number]['id'];

/** Shared summary context for tab badges (live count chips). */
export function useAdminSummary() {
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const refresh = useCallback(async () => {
    try {
      setSummary(await api.get<AdminSummary>('/api/summary'));
    } catch {
      /* retried on next SSE event */
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEventStream(refresh, refresh);
  return { summary, refresh };
}

/** `/admin/review/:tab` shell: top bar + left nav + tab content (03-pages). */
export function ReviewLayout() {
  const { tab } = useParams();
  const navigate = useNavigate();
  const { summary } = useAdminSummary();

  const active = REVIEW_TABS.find((t) => t.id === tab);
  if (!active) return <Navigate to="/admin/review/review-list" replace />;

  return (
    <div className="min-h-screen bg-canvas">
      <header className="relative flex h-14 items-center justify-between border-b border-mist bg-surface px-6">
        <div className="flex items-center gap-4">
          <Link
            to="/admin"
            className="inline-flex items-center gap-1 rounded-md px-1 text-[14px] font-semibold text-ink hover:text-ink-soft focus-visible:outline-2"
            style={{ outlineColor: 'var(--focus)' }}
          >
            <ChevronLeftIcon className="h-4 w-4" aria-hidden />
            Admin home
          </Link>
        </div>
        <div className="absolute left-1/2 -translate-x-1/2">
          <Logo to="/admin" />
        </div>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[14px] font-semibold text-ink transition-colors hover:opacity-80"
        >
          View site
          <ExternalIcon className="h-4 w-4" aria-hidden />
        </button>
      </header>

      <div className="mx-auto flex w-full max-w-[1400px] gap-8 px-6 py-8">
        <nav aria-label="Review sections" className="w-56 shrink-0">
          <ul className="sticky top-8 space-y-1">
            {REVIEW_TABS.map((t) => {
              const isActive = t.id === active.id;
              const count = t.count && summary ? summary[t.count] : null;
              return (
                <li key={t.id}>
                  <Link
                    to={`/admin/review/${t.id}`}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-[14px] font-semibold transition-colors focus-visible:outline-2',
                      isActive ? 'text-white' : 'text-ink hover:bg-surface',
                    )}
                    style={{
                      background: isActive ? 'var(--ink)' : undefined,
                      outlineColor: 'var(--focus)',
                    }}
                  >
                    <span>{t.label}</span>
                    {count !== null && count > 0 ? (
                      <span
                        className="num inline-flex min-w-6 items-center justify-center rounded-full px-1.5 text-[12px] font-bold"
                        style={
                          isActive
                            ? { background: 'rgba(255,255,255,0.2)', color: 'white' }
                            : { background: 'color-mix(in oklab, var(--cat-on-campus) 12%, white)', color: 'var(--cat-on-campus)' }
                        }
                      >
                        {count}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0 flex-1">
          {active.id === 'review-list' ? <ReviewListTab /> : null}
          {active.id === 'check-updates' ? <CheckUpdatesTab /> : null}
          {active.id === 'content-management' ? <ContentManagementTab /> : null}
        </div>
      </div>
    </div>
  );
}
