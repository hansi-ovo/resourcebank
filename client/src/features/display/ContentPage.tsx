import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useEventStream } from '@/lib/sse';
import { useReducedMotion } from '@/lib/motion';
import { Logo } from '@/components/ui/Logo';
import { domain } from '@/lib/format';
import { EntryModal } from './EntryModal';
import { CATEGORIES, type Entry, type PublishedSection } from 'shared/types';
import './content-page.css';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/**
 * Display content page `/resources` (03-pages §Display content page).
 * Full behavior: sections in canonical order, cards + modal, TOC scroll-spy,
 * ScrollTrigger reveals, SSE fade-swap, deep links, empty states.
 */
export function ContentPage() {
  const [sections, setSections] = useState<PublishedSection[] | null>(null);
  const [active, setActive] = useState<string>(CATEGORIES[0].id);
  const [modalEntry, setModalEntry] = useState<Entry | null>(null);
  const reduced = useReducedMotion();
  const scrollRefs = useRef(new Map<string, HTMLElement>());

  const load = useCallback(async () => {
    try {
      const fresh = await api.get<PublishedSection[]>('/api/published');
      setSections(fresh);
    } catch {
      setSections((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // SSE: refetch + quiet 150ms fade-swap on affected sections only
  const sectionsRef = useRef<PublishedSection[] | null>(null);
  sectionsRef.current = sections;
  useEventStream(
    useCallback(() => {
      const prev = sectionsRef.current;
      void api
        .get<PublishedSection[]>('/api/published')
        .then((fresh) => {
          setSections(fresh);
          if (!prev) return;
          const changed = new Set<string>();
          for (const s of fresh) {
            const before = prev.find((p) => p.category.id === s.category.id);
            const sameIds = (before?.entries ?? []).map((e) => e.id).join(',');
            const newIds = s.entries.map((e) => e.id).join(',');
            const sameMeta = (before?.entries ?? []).every((b) => {
              const n = s.entries.find((x) => x.id === b.id);
              return n && n.name === b.name && n.startsAt === b.startsAt && n.endsAt === b.endsAt;
            });
            if (sameIds !== newIds || !sameMeta) changed.add(s.category.id);
          }
          for (const id of changed) {
            const el = scrollRefs.current.get(id);
            el?.classList.add('is-fading');
            window.setTimeout(() => el?.classList.remove('is-fading'), 180);
          }
        })
        .catch(() => undefined);
    }, []),
    () => undefined,
  );

  // scroll-spy
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id);
        }
      },
      { rootMargin: '-30% 0px -55% 0px' },
    );
    for (const el of scrollRefs.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [sections]);

  // deep link #<categoryId> scrolls once sections exist
  useEffect(() => {
    if (sections === null) return;
    const hash = window.location.hash.replace('#', '');
    if (!hash) return;
    const el = scrollRefs.current.get(hash);
    if (el) {
      el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
      setActive(hash);
      history.replaceState(null, '', window.location.pathname);
    }
  }, [sections, reduced]);

  // ScrollTrigger section reveals (12px rise + rule wipe, once)
  useEffect(() => {
    if (reduced) return;
    const ctx = gsap.context(() => {
      document.querySelectorAll<HTMLElement>('.content-section').forEach((section) => {
        const title = section.querySelector('[data-section-title]');
        const rule = section.querySelector('[data-rule]');
        const grid = section.querySelector('[data-cards]');
        const tl = gsap.timeline({
          scrollTrigger: { trigger: section, start: 'top 78%', once: true },
        });
        if (title)
          tl.fromTo(title, { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: 'power2.out' }, 0);
        if (rule)
          tl.fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: 0.45, ease: 'power2.out' }, 0.05);
        if (grid)
          tl.fromTo(
            grid,
            { y: 12, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.4, ease: 'power2.out' },
            0.1,
          );
      });
    });
    return () => ctx.revert();
  }, [sections, reduced]);

  const jumpTo = useCallback(
    (id: string) => {
      const el = scrollRefs.current.get(id);
      if (!el) return;
      el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
      setActive(id);
    },
    [reduced],
  );

  return (
    <div className="content-root" data-content-page>
      <header className="content-header">
        <Logo />
      </header>
      <main className="content-main">
        {CATEGORIES.map((cat) => {
          const data = sections?.find((s) => s.category.id === cat.id) ?? null;
          const empty = sections !== null && (data?.entries.length ?? 0) === 0;
          const nextNonEmpty = CATEGORIES.find(
            (c, i) =>
              i > CATEGORIES.indexOf(cat) &&
              (sections?.find((s) => s.category.id === c.id)?.entries.length ?? 0) > 0,
          );
          return (
            <section
              key={cat.id}
              id={cat.id}
              ref={(el) => {
                if (el) scrollRefs.current.set(cat.id, el);
                else scrollRefs.current.delete(cat.id);
              }}
              className="content-section"
              data-cat={cat.id}
              style={{ ['--cat' as string]: cat.tint }}
            >
              <h2 className="content-title" data-section-title>
                {cat.label}
              </h2>
              <div className="content-rule" data-rule />
              {empty ? (
                <p className="content-empty">
                  Nothing here yet. New programs are added as they are reviewed.{' '}
                  {nextNonEmpty ? (
                    <a
                      href={`#${nextNonEmpty.id}`}
                      className="content-empty-link"
                      onClick={(e) => {
                        e.preventDefault();
                        jumpTo(nextNonEmpty.id);
                      }}
                    >
                      Browse other categories
                    </a>
                  ) : null}{' '}
                  {/* ⚑ copy */}
                </p>
              ) : (
                <div className="content-grid" data-cards>
                  {(data?.entries ?? []).map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      className="opportunity-card"
                      data-cat={cat.id}
                      style={{ ['--cat' as string]: cat.tint }}
                      onClick={() => setModalEntry(e)}
                    >
                      <span className="card-image">
                        {e.imageUrl ? (
                          <img src={e.imageUrl} alt={e.name} loading="lazy" />
                        ) : (
                          <span className="card-fallback" aria-hidden="true">
                            {e.name.slice(0, 1)}
                          </span>
                        )}
                      </span>
                      <span className="card-name">{e.name}</span>
                      <span className="card-meta">{e.audience.slice(0, 3).join(', ')}</span>
                      <span className="card-domain">{domain(e.url)}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </main>

      <SectionTOC active={active} onJump={jumpTo} />

      {modalEntry ? <EntryModal entry={modalEntry} onClose={() => setModalEntry(null)} /> : null}
    </div>
  );
}

/** Fixed right rail (02-design-system §5): ticks expand on hover/focus,
 *  click/Enter jumps, scroll-spy sets aria-current + wide tick. */
function SectionTOC({ active, onJump }: { active: string; onJump: (id: string) => void }) {
  return (
    <nav
      className="section-toc"
      aria-label="Sections"
      data-toc
      onMouseLeave={(e) => e.currentTarget.classList.remove('is-open')}
    >
      <div className="toc-list">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`toc-item ${active === c.id ? 'is-active' : ''}`}
            aria-current={active === c.id ? 'true' : undefined}
            onClick={() => onJump(c.id)}
            onFocus={(e) => e.currentTarget.closest('.section-toc')?.classList.add('is-open')}
            onMouseEnter={(e) => e.currentTarget.closest('.section-toc')?.classList.add('is-open')}
          >
            <span className="toc-tick" data-toc-tick data-cat={c.id} aria-hidden="true" />
            <span className="toc-label">{c.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
