import { useEffect, useRef, useState } from 'react';
import BlurText from '@/components/react-bits/BlurText';
import VariableProximity from '@/components/react-bits/VariableProximity';
import { Logo } from '@/components/ui/Logo';
import { useReducedMotion } from '@/lib/motion';
import { CATEGORIES } from 'shared/types';
import './hero.css';

/** First published seed entry name per category — showcase items (⚑ client re-picks). */
const SHOWCASE_ITEMS: Record<string, string> = {
  'on-campus': 'DKU Leadership Fellows Program',
  fellowships: 'Laidlaw Scholars',
  experiential: 'McKinsey Discovery Undergraduate Program',
  events: 'HPAIR',
  training: 'NOLS Wilderness Leadership Course',
};

const KEYWORD_TINTS: Array<{ word: string; tint: string }> = [
  { word: 'experiences', tint: '#3E7A5C' },
  { word: 'Fellowships', tint: '#33605B' },
  { word: 'Event', tint: '#3F5F85' },
  { word: 'Conference', tint: '#3F5F85' },
];

/**
 * Display hero `/` (03-pages §Display hero).
 * Split 7/5: BlurText title → gradient reveal body (keyword tints, 1.06em
 * scale) → CTA; post-reveal VariableProximity on the title; right = showcase
 * strip ladder (drift up, docked emphasis, hover pause); mobile = static pills.
 */
export function Hero({ onStarted }: { onStarted: () => void }) {
  const reduced = useReducedMotion();
  const leftRef = useRef<HTMLDivElement>(null);
  const [titleSettled, setTitleSettled] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);

  // Reduced motion: skip BlurText/VP entirely; title settles immediately.
  useEffect(() => {
    if (reduced) setTitleSettled(true);
  }, [reduced]);

  return (
    <div className="hero-root" data-hero-root>
      <header className="hero-header">
        <Logo />
      </header>

      <main className="hero-main">
        <div className="hero-left" ref={leftRef}>
          <h1 className="hero-title" ref={titleRef} aria-label="DKU Leadership Resource Bank">
            {reduced ? (
              <span className="hero-title-static">DKU Leadership Resource Bank</span>
            ) : (
              <>
                {/* BlurText stays mounted (display:none after settle) so its
                    IntersectionObserver teardown never races the unobserve. */}
                <span style={{ display: titleSettled ? 'none' : 'contents' }}>
                  <BlurText
                    text="DKU Leadership Resource Bank"
                    delay={80}
                    stepDuration={0.35}
                    className="hero-title-blur"
                    onAnimationComplete={() => setTitleSettled(true)}
                  />
                </span>
                {titleSettled ? (
                  <VariableProximity
                    label="DKU Leadership Resource Bank"
                    containerRef={leftRef}
                    fromFontVariationSettings="'wght' 300, 'opsz' 12"
                    toFontVariationSettings="'wght' 800, 'opsz' 40"
                    radius={90}
                    falloff="gaussian"
                    className="hero-title-vp"
                  />
                ) : null}
              </>
            )}
          </h1>

          <div
            className={`hero-reveal ${titleSettled || reduced ? 'is-in' : ''}`}
            style={reduced ? { transitionDuration: '200ms' } : undefined}
          >
            <p className="hero-subtitle">Discover Opportunities Beyond the Classroom</p>
            <p className="hero-body">
              Leadership development does not happen in a single program—it happens through a series
              of{' '}
              <TintedWord word="experiences" />
              . This Resource Bank is curated by DKU Leadership Programs to help students discover
              high-quality opportunities inside and outside Duke Kunshan University, including{' '}
              <TintedWord word="Fellowships" />
              , <TintedWord word="Event" />
              , <TintedWord word="Conference" />, and other developmental experiences.
            </p>
            <button type="button" className="hero-cta" onClick={onStarted}>
              Get started!
            </button>
          </div>
        </div>

        <ShowcaseStrip reduced={reduced} />
      </main>
    </div>
  );
}

function TintedWord({ word }: { word: string }) {
  const tint = KEYWORD_TINTS.find((k) => k.word === word)?.tint ?? 'var(--ramp-mid)';
  return (
    <span className="hero-keyword" style={{ color: tint }}>
      {word}
    </span>
  );
}

/**
 * Showcase strip (D20): flat 2D vertical ladder. Items drift upward through a
 * fixed "docked" highlight zone (full opacity + full size + longer underline);
 * neighbors 45% opacity / 0.92 scale; hover pauses. Mobile <960px: static pills.
 */
function ShowcaseStrip({ reduced }: { reduced: boolean }) {
  const listRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const offsetRef = useRef(0);
  const itemHeight = 96; // px per ladder step
  const viewportH = 384; // 4 slots visible

  useEffect(() => {
    if (reduced || paused) return;
    const el = listRef.current;
    if (!el) return;
    let raf = 0;
    let last = performance.now();
    let activeRow = -1;

    const DRIFT_PX_PER_S = 6; // slow drift
    const total = CATEGORIES.length * itemHeight;

    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      offsetRef.current = (offsetRef.current + DRIFT_PX_PER_S * dt) % total;
      const y = offsetRef.current;

      // translate-only transform (GSAP-equivalent, rAF-driven; stays on GPU).
      // 3 copies — keep the viewport inside the middle copy for seamless wrap.
      el.style.transform = `translate3d(0, ${-(total + y)}px, 0)`;

      // fixed dock zone = viewport middle band; find the row under it
      const zoneCenter = (total * 1 + y + viewportH / 2) / itemHeight;
      const row = Math.floor(zoneCenter);
      if (row !== activeRow) {
        activeRow = row;
        const rows = el.children;
        for (let i = 0; i < rows.length; i++) {
          (rows[i] as HTMLElement).classList.toggle('is-docked', i === row);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduced, paused]);

  const rows = [...CATEGORIES, ...CATEGORIES, ...CATEGORIES]; // wrap runway

  return (
    <aside
      className="showcase"
      aria-label="Program categories"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      {/* mobile static pills */}
      <div className="showcase-mobile">
        {CATEGORIES.map((c) => (
          <span
            key={c.id}
            className="showcase-pill"
            data-cat={c.id}
            style={{ ['--cat' as string]: c.tint }}
          >
            {c.label}
          </span>
        ))}
      </div>

      {/* desktop ladder */}
      <div className="showcase-viewport" aria-hidden="true">
        <div className="showcase-list" ref={listRef}>
          {rows.map((c, i) => (
            <div
              key={`${c.id}-${i}`}
              className="showcase-item"
              data-cat={c.id}
              style={{ ['--cat' as string]: c.tint }}
            >
              <span className="showcase-label" data-showcase-label data-cat={c.id}>
                {c.label}
              </span>
              <span className="showcase-rule" />
              <span className="showcase-item-name">{SHOWCASE_ITEMS[c.id]}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
