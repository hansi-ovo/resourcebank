import { useEffect, useRef, useState } from 'react';
import BlurText from '@/components/react-bits/BlurText';
import VariableProximity from '@/components/react-bits/VariableProximity';
import CursorGrid from '@/components/react-bits/CursorGrid';
import { Logo } from '@/components/ui/Logo';
import { useReducedMotion } from '@/lib/motion';
import { ShowcaseWheel } from './ShowcaseWheel';
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
 * Display hero `/` (rev 13: background word bed removed) — the reveal
 * sequence starts after a short settle delay on load: blur title →
 * subtitle → description → CTA, wheel fades in alongside.
 */
export function Hero({ onStarted }: { onStarted: () => void }) {
  const reduced = useReducedMotion();
  const leftRef = useRef<HTMLDivElement>(null);
  // rev 9: the falling-words drop is gone — the reveal sequence now starts
  // after a short settle delay on load (was: gated on the words passing 2/3)
  const [revealStarted, setRevealStarted] = useState(false);
  const [titleSettled, setTitleSettled] = useState(false);

  useEffect(() => {
    if (reduced) {
      setRevealStarted(true);
      setTitleSettled(true);
    }
  }, [reduced]);

  useEffect(() => {
    if (reduced) return;
    const id = window.setTimeout(() => setRevealStarted(true), 400);
    return () => window.clearTimeout(id);
  }, [reduced]);

  return (
    <div className="hero-root" data-hero-root>
      {/* mouse-follow grid (request 4c rev 5: base grid brightness +30%
          again (0.08 → 0.104); cursor-proximity peak boosted further on top
          of that base (0.94 → 1) — react-bits Cursor Grid look) */}
      {!reduced ? (
        <CursorGrid
          className="hero-cursor-grid"
          cellSize={56}
          color="#336472"
          radius={180}
          falloff="smooth"
          maxOpacity={1}
          lineWidth={1.2}
          fillOpacity={0.1}
          gridOpacity={0.104}
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
                {/* title reveals after the short settle delay (rev 9: no
                    word-drop gate anymore). The blur stage is
                    position:absolute so the hidden spacer can't push the
                    real title down. */}
                {revealStarted ? (
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
                {/* vp stage keeps occupying layout the whole time (visibility,
                    not display) so the h1 never resizes at the settle moment */}
                <span
                  className="hero-title-vp-stage"
                  style={{ visibility: titleSettled ? 'visible' : 'hidden' }}
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

        {/* rev 8 (request 2): the whole wheel fades in like the left copy
            once the reveal sequence starts; images entering the path
            afterwards appear at full opacity (no per-image fade) */}
        <div className={`showcase-wheel-fade ${titleSettled ? 'is-on' : ''}`}>
          <ShowcaseWheel reduced={reduced} />
        </div>
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
