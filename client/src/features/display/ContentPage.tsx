import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useEventStream } from '@/lib/sse';
import { Logo } from '@/components/ui/Logo';
import { domain } from '@/lib/format';
import { CATEGORIES, type PublishedSection } from 'shared/types';
import './content-page.css';

/**
 * Display content page `/resources` (03-pages §Display content page).
 * Sections render immediately from the canonical category list (the transition
 * needs title targets without waiting on /api/published); entries fill in.
 * Phase 3 scope: section skeleton + cards. Phase 4 adds modals, scroll
 * reveals, SSE fade-swap, TOC scroll-spy, deep links, empty states.
 */
export function ContentPage() {
  const [sections, setSections] = useState<PublishedSection[] | null>(null);

  const load = useCallback(async () => {
    try {
      setSections(await api.get<PublishedSection[]>('/api/published'));
    } catch {
      setSections([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // quiet refresh on admin mutations (fade-swap arrives in Phase 4)
  useEventStream(() => void load(), () => undefined);

  return (
    <div className="content-root" data-content-page>
      <header className="content-header">
        <Logo />
      </header>
      <main className="content-main">
        {CATEGORIES.map((cat) => {
          const data = sections?.find((s) => s.category.id === cat.id) ?? null;
          return <Section key={cat.id} category={cat} entries={data?.entries ?? []} loading={sections === null} />;
        })}
      </main>
      <SectionTOC />
    </div>
  );
}

function Section({
  category,
  entries,
  loading,
}: {
  category: (typeof CATEGORIES)[number];
  entries: PublishedSection['entries'];
  loading: boolean;
}) {
  const empty = !loading && entries.length === 0;
  return (
    <section
      className="content-section"
      id={category.id}
      data-cat={category.id}
      style={{ ['--cat' as string]: category.tint }}
    >
      <h2 className="content-title" data-section-title>
        {category.label}
      </h2>
      <div className="content-rule" data-rule />
      {empty ? (
        <p className="content-empty">
          Nothing here yet. New programs are added as they are reviewed.
        </p>
      ) : (
        <div className="content-grid" data-cards>
          {entries.map((e) => (
            <article
              key={e.id}
              className="opportunity-card"
              data-cat={category.id}
              style={{ ['--cat' as string]: category.tint }}
            >
              <div className="card-image">
                {e.imageUrl ? (
                  <img src={e.imageUrl} alt={e.name} loading="lazy" />
                ) : (
                  <span className="card-fallback" aria-hidden="true">
                    {e.name.slice(0, 1)}
                  </span>
                )}
              </div>
              <h3 className="card-name">{e.name}</h3>
              <p className="card-meta">{e.audience.slice(0, 3).join(', ')}</p>
              <span className="card-domain">{domain(e.url)}</span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

/** Fixed right rail ticks — full behavior (hover expand, scroll-spy) in Phase 4. */
function SectionTOC() {
  return (
    <nav className="section-toc" aria-label="Sections" data-toc>
      <span className="toc-tick" data-toc-tick data-cat="on-campus" />
      <span className="toc-tick" data-toc-tick data-cat="fellowships" />
      <span className="toc-tick" data-toc-tick data-cat="experiential" />
      <span className="toc-tick" data-toc-tick data-cat="events" />
      <span className="toc-tick" data-toc-tick data-cat="training" />
    </nav>
  );
}
