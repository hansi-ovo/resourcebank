import { useEffect, useRef, useState } from 'react';
import BlurText from '@/components/react-bits/BlurText';
import VariableProximity from '@/components/react-bits/VariableProximity';
import CursorGrid from '@/components/react-bits/CursorGrid';
import { Logo } from '@/components/ui/Logo';
import { useReducedMotion } from '@/lib/motion';
import { CATEGORIES } from 'shared/types';
import { FallingWords } from './FallingWords';
import './hero.css';

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
 * Falling word list (request 1.4): rendered as three tidy rows at the very
 * top, then dropped with physics (messy, scaled, draggable, bottom pile).
 */
const FALLING_WORDS = [
  'leadership', 'fellowships', 'scholarships', 'experiences', 'opportunities',
  'campus', 'conference', 'symposium', 'training', 'mentorship', 'research',
  'community', 'global', 'programs', 'summit', 'exchange', 'discovery',
  'internships', 'governance', 'consulting', 'sustainability', 'networking',
];

/**
 * Display hero `/` — client revision 2.
 * Load order (1.5): falling words drop FIRST and immediately; once they pass
 * ~2/3 of the viewport the title → subtitle → description reveal runs.
 */
export function Hero({ onStarted }: { onStarted: () => void }) {
  const reduced = useReducedMotion();
  const leftRef = useRef<HTMLDivElement>(null);
  const [wordsDropped, setWordsDropped] = useState(false);
  const [titleSettled, setTitleSettled] = useState(false);

  useEffect(() => {
    if (reduced) {
      setWordsDropped(true);
      setTitleSettled(true);
    }
  }, [reduced]);

  return (
    <div className="hero-root" data-hero-root>
      {/* mouse-follow grid (request 1a: base grid +20%, near-cursor +30% more) */}
      {!reduced ? (
        <CursorGrid
          className="hero-cursor-grid"
          cellSize={56}
          color="#336472"
          radius={170}
          falloff="smooth"
          maxOpacity={0.72}
          lineWidth={1}
          fillOpacity={0.072}
          gridOpacity={0.06}
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
                {/* title waits until the falling words pass the 2/3 mark
                    (request 1.5: words drop first, then title → subtitle →
                    description → CTA) */}
                {wordsDropped ? (
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
                ) : null}
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

          <div className={`hero-seq ${titleSettled ? 'is-on' : ''}`}>
            <p className="hero-subtitle">Discover Opportunities Beyond the Classroom</p>
            <p className="hero-body">
              Leadership development does not happen in a single program—it happens through a
              series of <TintedWord word="experiences" />. This Resource Bank is curated by DKU
              Leadership Programs to help students discover high-quality opportunities inside and
              outside Duke Kunshan University, including <TintedWord word="Fellowships" />
              , <TintedWord word="Event" />, <TintedWord word="Conference" />, and other
              developmental experiences.
            </p>
            <button type="button" className="hero-cta" onClick={onStarted}>
              Get started!
            </button>
          </div>
        </div>

        <ShowcaseStrip reduced={reduced} />
      </main>

      {/* falling words (request 1.4/1.5): drop first; the copy reveal is gated
          on their descent past the 2/3 mark (~1.1s) */}
      {!reduced ? (
        <FallingWords
          className="hero-fall-bed"
          words={FALLING_WORDS}
          onDropped={() => setWordsDropped(true)}
        />
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
 * Showcase strip (D20 + request 1): fast drift, strong docked emphasis.
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

    const DRIFT_PX_PER_S = 18;
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
