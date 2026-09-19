import { Suspense, useEffect, useRef, useState } from 'react';
import React from 'react';
import BlurText from '@/components/react-bits/BlurText';
import VariableProximity from '@/components/react-bits/VariableProximity';
import CursorGrid from '@/components/react-bits/CursorGrid';
import { Logo } from '@/components/ui/Logo';
import { useReducedMotion } from '@/lib/motion';
import { CATEGORIES } from 'shared/types';
import './hero.css';

// matter-js (FallingText's physics engine) is ~50KB gz — load the falling bed
// AFTER first paint so it never blocks the hero's critical path.
const FallingText = React.lazy(() =>
  import('@/components/react-bits/FallingText').then((m) => ({ default: m.default })),
);

/** First published seed entry name per category — showcase items (⚑ client re-picks). */
const SHOWCASE_ITEMS: Record<string, string> = {
  'on-campus': 'Student Leaders Board',
  fellowships: 'Laidlaw Scholars',
  experiential: 'Harvard HSYLC',
  events: 'Yenching Global Symposium',
  training: 'Climate X Leadership Training',
};

const KEYWORD_TINTS: Array<{ word: string; tint: string }> = [
  { word: 'experiences', tint: '#3E7A5C' },
  { word: 'Fellowships', tint: '#33605B' },
  { word: 'Event', tint: '#3F5F85' },
  { word: 'Conference', tint: '#3F5F85' },
];

/**
 * Falling-word pool (client request 3c.iii): drawn from the site description
 * + the client's content sheet program names. Words fall into a ~1/5-height
 * low-opacity bed behind the hero content.
 */
const FALLING_WORDS = [
  'leadership', 'fellowships', 'scholarships', 'experiences', 'opportunities',
  'schwarzman', 'rhodes', 'fulbright', 'yenching', 'millennium', 'erasmus',
  'campus', 'conference', 'symposium', 'training', 'mentorship', 'research',
  'community', 'global', 'programs', 'discovery', 'growth', 'impact', 'summit',
  'advising', 'consulting', 'sustainability', 'entrepreneurship', 'exchange',
  'princeton', 'harvard', 'oxford', 'tsinghua', 'peking', 'duke', 'kunshan',
];

/**
 * Display hero `/` (03-pages §Display hero + client revision requests).
 * Split 7/5; 2s sequential reveal (title → subtitle → description → CTA);
 * CursorGrid mouse effect; falling-letters background bed; faster showcase
 * drift with prominent docked emphasis.
 */
export function Hero({ onStarted }: { onStarted: () => void }) {
  const reduced = useReducedMotion();
  const leftRef = useRef<HTMLDivElement>(null);
  const [titleSettled, setTitleSettled] = useState(false);

  useEffect(() => {
    if (reduced) setTitleSettled(true);
  }, [reduced]);

  return (
    <div className="hero-root" data-hero-root>
      {/* mouse-follow grid in theme green/blue (request 3c.ii) */}
      {!reduced ? (
        <CursorGrid
          className="hero-cursor-grid"
          cellSize={56}
          color="#336472"
          radius={150}
          falloff="smooth"
          maxOpacity={0.35}
          lineWidth={1}
          fillOpacity={0.05}
          gridOpacity={0.04}
          clickPulse={false}
        />
      ) : null}

      <header className="hero-header">
        <Logo />
      </header>

      <main className="hero-main">
        <div className="hero-left" ref={leftRef}>
          <h1 className="hero-title" aria-label="DKU Leadership Resource Bank">
            {reduced ? (
              <span className="hero-title-static">DKU Leadership Resource Bank</span>
            ) : (
              <>
                <span
                  className="hero-title-blur-stage"
                  style={{ visibility: titleSettled ? 'hidden' : 'visible' }}
                >
                  <BlurText
                    text="DKU Leadership Resource Bank"
                    delay={80}
                    stepDuration={0.35}
                    className="hero-title-blur"
                    onAnimationComplete={() => setTitleSettled(true)}
                  />
                </span>
                <span
                  className="hero-title-vp-stage"
                  style={{ display: titleSettled ? 'block' : 'none' }}
                  aria-hidden={!titleSettled}
                >
                  <VariableProximity
                    label="DKU Leadership Resource Bank"
                    containerRef={leftRef}
                    fromFontVariationSettings="'wght' 300, 'opsz' 12"
                    toFontVariationSettings="'wght' 800, 'opsz' 40"
                    radius={90}
                    falloff="gaussian"
                    className="hero-title-vp"
                  />
                </span>
              </>
            )}
          </h1>

          {/* 2s sequential reveal: subtitle (0.7s) → description (1.3s) → CTA (1.9s) */}
          <div className={`hero-seq ${titleSettled || reduced ? 'is-on' : ''}`}>
            <p className="hero-subtitle">Discover Opportunities Beyond the Classroom</p>
            <p className="hero-body">
              Leadership development does not happen in a single program—it happens through a series
              of <TintedWord word="experiences" />. This Resource Bank is curated by DKU Leadership
              Programs to help students discover high-quality opportunities inside and outside Duke
              Kunshan University, including <TintedWord word="Fellowships" />,{' '}
              <TintedWord word="Event" />, <TintedWord word="Conference" />, and other
              developmental experiences.
            </p>
            <button type="button" className="hero-cta" onClick={onStarted}>
              Get started!
            </button>
          </div>
        </div>

        <ShowcaseStrip reduced={reduced} />
      </main>

      {/* falling-letters bed (request 3c.iii) — lazy: physics engine off the
          critical path; words start dropping in shortly after paint */}
      {!reduced ? (
        <div className="hero-fall-bed" aria-hidden="true">
          <Suspense fallback={null}>
            <FallingText
              text={FALLING_WORDS.join(' ')}
              trigger="auto"
              gravity={0.9}
              fontSize="15px"
            />
          </Suspense>
        </div>
      ) : null}
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
 * Showcase strip (D20 + request 3c.iv): faster drift (18px/s), stronger
 * non-docked demotion, bolder docked treatment.
 */
function ShowcaseStrip({ reduced }: { reduced: boolean }) {
  const listRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const offsetRef = useRef(0);
  const itemHeight = 96;
  const viewportH = 384;

  useEffect(() => {
    if (reduced || paused) return;
    const el = listRef.current;
    if (!el) return;
    let raf = 0;
    let last = performance.now();
    let activeRow = -1;

    const DRIFT_PX_PER_S = 18; // faster (was 6)
    const total = CATEGORIES.length * itemHeight;

    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      offsetRef.current = (offsetRef.current + DRIFT_PX_PER_S * dt) % total;
      const y = offsetRef.current;
      el.style.transform = `translate3d(0, ${-(total + y)}px, 0)`;

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

  const rows = [...CATEGORIES, ...CATEGORIES, ...CATEGORIES];

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
