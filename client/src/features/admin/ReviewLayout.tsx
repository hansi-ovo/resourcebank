import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { api } from '@/lib/api';
import { useEventStream } from '@/lib/sse';
import { Logo } from '@/components/ui/Logo';
import { ChevronLeftIcon, ChevronRightIcon, ExternalIcon } from './icons';
import { ReviewListTab } from './ReviewListTab';
import { CheckUpdatesTab } from './CheckUpdatesTab';
import { ContentManagementTab } from './ContentManagementTab';
import { ManualAddTab } from './ManualAddTab';
import type { AdminSummary } from 'shared/types';
import { cn } from '@/lib/utils';

export const REVIEW_TABS = [
  { id: 'review-list', label: 'Review list', count: 'reviewCount' as const },
  { id: 'check-updates', label: 'Check updates', count: 'pendingUpdatesCount' as const },
  { id: 'content-management', label: 'Content management', count: null },
  { id: 'manual-add', label: 'Add manually', count: null },
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

/** `/admin/review/:tab` shell: sticky top bar + collapsible left nav + tabs. */
export function ReviewLayout() {
  const { tab } = useParams();
  const navigate = useNavigate();
  const { summary } = useAdminSummary();
  // sidebar collapse (request 3a) — collapsed survives tab switches, resets on reload
  const [navCollapsed, setNavCollapsed] = useState(false);

  const active = REVIEW_TABS.find((t) => t.id === tab);
  if (!active) return <Navigate to="/admin/review/review-list" replace />;

  return (
    <div className="min-h-screen bg-canvas">
      {/* sticky top bar (request 3e) */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-mist bg-surface px-4">
        <div className="flex items-center gap-2">
          {/* collapse toggle (request 3a) */}
          <button
            type="button"
            onClick={() => setNavCollapsed((c) => !c)}
            aria-label={navCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!navCollapsed}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-mist bg-surface text-ink-soft transition-colors hover:border-ink-soft/40 hover:text-ink focus-visible:outline-2"
            style={{ outlineColor: 'var(--focus)' }}
          >
            {navCollapsed ? (
              <ChevronRightIcon className="h-4 w-4" aria-hidden />
            ) : (
              <ChevronLeftIcon className="h-4 w-4" aria-hidden />
            )}
          </button>
          <Link
            to="/admin"
            className="inline-flex items-center gap-1 rounded-md px-1 text-[14px] font-semibold text-ink hover:text-ink-soft focus-visible:outline-2"
            style={{ outlineColor: 'var(--focus)' }}
          >
            <ChevronLeftIcon className="-ml-1 h-4 w-4" aria-hidden />
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

      <div
        className={cn(
          'mx-auto flex w-full max-w-none items-start px-4 py-6',
          navCollapsed ? 'gap-0' : 'gap-6',
        )}
      >
        <nav
          aria-label="Review sections"
          className={cn(
            'sticky top-[72px] shrink-0 overflow-hidden transition-all duration-200',
            navCollapsed ? 'w-0 opacity-0' : 'w-56 opacity-100',
          )}
        >
          <ul className="space-y-1">
            {REVIEW_TABS.map((t) => {
              const isActive = t.id === active.id;
              const count = t.count && summary ? summary[t.count] : null;
              return (
                <li key={t.id}>
                  <Link
                    to={`/admin/review/${t.id}`}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'flex w-full items-center justify-between px-3 py-2.5 text-[14px] font-semibold transition-colors focus-visible:outline-2',
                      isActive ? 'text-ink' : 'text-ink hover:bg-surface',
                    )}
                    style={{
                      /* active = display-site blue, only faintly distinct from
                         the background (request 3a rev 6) */
                      background: isActive ? 'color-mix(in oklab, var(--ramp-mid) 13%, transparent)' : undefined,
                      borderRadius: 0,
                      outlineColor: 'var(--focus)',
                    }}
                  >
                    <span className="whitespace-nowrap">{t.label}</span>
                    {count !== null && count > 0 ? (
                      <span
                        className="num inline-flex min-w-6 items-center justify-center rounded-full px-1.5 text-[12px] font-bold"
                        style={
                          isActive
                            ? {
                                background: 'color-mix(in oklab, var(--ramp-mid) 16%, white)',
                                color: 'var(--ramp-mid-deep)',
                              }
                            : {
                                background: 'color-mix(in oklab, var(--cat-on-campus) 12%, white)',
                                color: 'var(--cat-on-campus)',
                              }
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

        <div className="min-w-0 flex-shrink">
          {active.id === 'review-list' ? <ReviewListTab /> : null}
          {active.id === 'check-updates' ? <CheckUpdatesTab /> : null}
          {active.id === 'content-management' ? <ContentManagementTab /> : null}
          {active.id === 'manual-add' ? <ManualAddTab /> : null}
        </div>
      </div>
    </div>
  );
}
