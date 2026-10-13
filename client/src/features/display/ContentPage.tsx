import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useEventStream } from '@/lib/sse';
import { useReducedMotion } from '@/lib/motion';
import { Logo } from '@/components/ui/Logo';
import { displayImageUrl } from '@/lib/format';
import { EntryModal } from './EntryModal';
import { CATEGORIES, type Entry, type PublishedSection } from 'shared/types';
import { CATEGORY_DESCRIPTIONS } from './categoryDescriptions';
import './content-page.css';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/**
 * Category section descriptions (request 2.4) — copy from the client's
 * 调试.md, rendered under each section title.
 */

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
      // No API reachable (e.g. single-file export opened via file://) —
      // fall back to the embedded demo snapshot so the catalog still shows.
      // Dynamic import keeps the snapshot out of the normal production bundle.
      const { DEMO_SECTIONS } = await import('@/lib/demoSnapshot');
      setSections((prev) => prev ?? DEMO_SECTIONS);
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

  // hold scroll-spy briefly during programmatic/deep-link scrolls so the
  // target section's active state isn't overwritten mid-flight
  const spyHoldRef = useRef(false);

  // scroll-spy
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !spyHoldRef.current) setActive(e.target.id);
        }
      },
      { rootMargin: '-30% 0px -55% 0px' },
    );
    for (const el of scrollRefs.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [sections]);

  // deep link #<categoryId> scrolls once sections exist (respecting reduced
  // motion) and sets active TOC; hold scroll-spy during the flight
  useEffect(() => {
    if (sections === null) return;
    const hash = window.location.hash.replace('#', '');
    if (!hash) return;
    const el = scrollRefs.current.get(hash);
    if (el) {
      spyHoldRef.current = true;
      el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
      setActive(hash);
      window.setTimeout(() => {
        spyHoldRef.current = false;
      }, reduced ? 150 : 800);
      history.replaceState(null, '', window.location.pathname);
    }
  }, [sections, reduced]);

  // ScrollTrigger reveals (request 4c): section title rise + rule wipe once,
  // plus a smooth per-card fade-in as cards enter the viewport.
  useEffect(() => {
    if (reduced) return;
    const ctx = gsap.context(() => {
      document.querySelectorAll<HTMLElement>('.content-section').forEach((section) => {
        const title = section.querySelector('[data-section-title]');
        const desc = section.querySelector('[data-section-desc]');
        const rule = section.querySelector('[data-rule]');
        const tl = gsap.timeline({
          scrollTrigger: { trigger: section, start: 'top 78%', once: true },
        });
        if (title)
          tl.fromTo(
            title,
            { y: 14, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.6, ease: 'power2.out' },
            0,
          );
        // category description fades in with the title (request 2, rev 6)
        if (desc)
          tl.fromTo(
            desc,
            { y: 10, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.6, ease: 'power2.out' },
            0.08,
          );
        if (rule)
          tl.fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: 0.65, ease: 'power2.out' }, 0.05);
        const cards = section.querySelectorAll<HTMLElement>('[data-cards] > .opportunity-card');
        if (cards.length) {
          gsap.fromTo(
            cards,
            { y: 18, opacity: 0 },
            {
              y: 0,
              opacity: 1,
              duration: 0.6,
              stagger: 0.08,
              ease: 'power2.out',
              scrollTrigger: { trigger: section, start: 'top 72%', once: true },
            },
          );
        }
      });
    });
    return () => ctx.revert();
  }, [sections, reduced]);

  const jumpTo = useCallback(
    (id: string) => {
      const el = scrollRefs.current.get(id);
      if (!el) return;
      spyHoldRef.current = true;
      el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
      setActive(id);
      window.setTimeout(() => {
        spyHoldRef.current = false;
      }, reduced ? 150 : 800);
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
              {CATEGORY_DESCRIPTIONS[cat.id] ? (
                <p className="content-section-desc" data-section-desc>
                  {CATEGORY_DESCRIPTIONS[cat.id]}
                </p>
              ) : null}
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
              ) : sections === null ? (
                <div className="content-grid" data-cards data-skeleton aria-hidden="true">
                  {/* skeleton cards hold layout while /api/published loads (CLS fix) */}
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="opportunity-card is-skeleton">
                      <span className="card-image" />
                      <span className="card-name">…</span>
                      <span className="card-meta">…</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="content-grid" data-cards>
                  {(data?.entries ?? []).map((e, i) => (
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
                          <img
                            src={displayImageUrl(e.imageUrl) ?? undefined}
                            alt={e.name}
                            loading={i < 3 ? 'eager' : 'lazy'}
                            fetchPriority={i === 0 ? 'high' : undefined}
                          />
                        ) : (
                          <span className="card-fallback" aria-hidden="true">
                            {e.name.slice(0, 1)}
                          </span>
                        )}
                      </span>
                      <span className="card-name">{e.name}</span>
                      <span className="card-meta">{e.audience.slice(0, 3).join(', ')}</span>
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

/** Left vertical timeline TOC (rev 9, request: 删除右侧目录) — a slim
 *  vertical rail with category-tinted nodes and always-visible labels.
 *  Mounts with a top-to-bottom stagger fade on first interaction-safe
 *  render (常驻: stays visible afterwards); click/Enter jumps; scroll-spy
 *  sets aria-current + enlarges the active node. */
function SectionTOC({ active, onJump }: { active: string; onJump: (id: string) => void }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(id);
  }, []);
  return (
    <nav className={`section-toc ${mounted ? 'is-in' : ''}`} aria-label="Sections" data-toc>
      <span className="toc-rail" aria-hidden="true" />
      <div className="toc-list">
        {CATEGORIES.map((c, i) => (
          <button
            key={c.id}
            type="button"
            className={`toc-item ${active === c.id ? 'is-active' : ''}`}
            aria-current={active === c.id ? 'true' : undefined}
            onClick={() => onJump(c.id)}
            style={{ transitionDelay: mounted ? `${i * 70}ms` : '0ms' }}
          >
            <span className="toc-tick" data-toc-tick data-cat={c.id} aria-hidden="true" />
            <span className="toc-label">{c.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
