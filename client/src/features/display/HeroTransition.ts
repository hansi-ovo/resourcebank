import { CATEGORIES } from 'shared/types';
import { gsap } from 'gsap';

/**
 * Signature moment (rev 14: giant scatter words removed — fullscreen color
 * panels only).
 *
 * Choreography (~1.35s, transforms/opacity only, nothing leaves the viewport):
 *  0.00s  build a fixed overlay
 *  0.00–0.45s  five full-screen category-color panels sweep in from
 *              alternating sides and slide together to cover the screen
 *  0.45s  route swaps to /resources beneath the opaque overlay
 *  0.50–0.95s  panels collapse into thin tonal rule strips (converge)
 *  0.95–1.35s  overlay fades as the real page (titles + rules) reveals;
 *              TOC ticks stagger in; overlay unmounts
 *
 * Reduced motion: 250ms crossfade (no overlay).
 */

interface StartOpts {
  reduced: boolean;
  swapRoute: () => void;
  onDone: () => void;
}

export function startHeroTransition(opts: StartOpts): void {
  const { reduced, swapRoute, onDone } = opts;

  if (reduced) {
    const root = document.querySelector('[data-hero-root]') as HTMLElement | null;
    if (root) {
      gsap.to(root, {
        opacity: 0,
        duration: 0.25,
        ease: 'none',
        onComplete: () => {
          root.style.opacity = '1';
          swapRoute();
          onDone();
        },
      });
    } else {
      swapRoute();
      onDone();
    }
    return;
  }

  const cats = CATEGORIES;
  const W = window.innerWidth;

  // ── build the overlay ────────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.setAttribute('data-transition-overlay', '');
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:1000;pointer-events:none;overflow:hidden;will-change:transform,opacity;';
  document.body.appendChild(overlay);

  // five full-color panels that sweep in and interlock column-wise
  const panels = cats.map((c, i) => {
    const p = document.createElement('div');
    p.setAttribute('data-transition-panel', c.id);
    p.style.cssText = `
      position: absolute;
      top: 0; bottom: 0;
      width: ${Math.ceil(W / 5) + 2}px;
      left: ${i * Math.ceil(W / 5)}px;
      background: ${c.tint};
      will-change: transform, opacity;
      transform: translateX(${i % 2 === 0 ? W : -W}px);
    `;
    overlay.appendChild(p);
    return p;
  });

  const heroRoot = document.querySelector('[data-hero-root]') as HTMLElement | null;

  const tl = gsap.timeline({
    onComplete: () => {
      overlay.remove();
      onDone();
    },
  });

  // ── phase 1 (0–0.45s): panels interlock into a color wall ─────────────
  if (heroRoot) tl.to(heroRoot, { opacity: 0.15, duration: 0.35, ease: 'power2.out' }, 0);
  panels.forEach((p, i) => {
    tl.to(p, { x: 0, duration: 0.42, ease: 'power3.inOut' }, i * 0.03);
  });

  // ── phase 2 (0.45s): route swap beneath the opaque overlay ───────────
  tl.call(swapRoute, undefined, 0.45);
  tl.call(
    () => {
      const page = document.querySelector('[data-content-page]');
      if (page instanceof HTMLElement) page.style.opacity = '0';
    },
    undefined,
    0.46,
  );

  // ── phase 3 (0.5–0.95s): panels fold into slim rule strips (category
  // rules echo) ────────────────────────────────────────────────────────────
  tl.call(
    () => {
      panels.forEach((p, i) => {
        gsap.to(p, { scaleY: 0.006, y: (i - 2) * 5, opacity: 0.8, duration: 0.45, ease: 'power3.inOut' });
      });
    },
    undefined,
    0.5,
  );

  // ── phase 4 (0.95–1.35s): reveal the real page ───────────────────────
  tl.to(panels, { opacity: 0, duration: 0.25, ease: 'power1.out' }, 0.95);
  tl.call(
    () => {
      const page = document.querySelector('[data-content-page]');
      if (page instanceof HTMLElement) {
        page.style.transition = 'opacity 350ms ease';
        page.style.opacity = '1';
        page.querySelectorAll<HTMLElement>('[data-rule]').forEach((rule, i) => {
          gsap.fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: 0.5, delay: i * 0.06, ease: 'power2.out' });
        });
        const ticks = page.querySelectorAll<HTMLElement>('[data-toc-tick]');
        gsap.fromTo(ticks, { opacity: 0, x: 12 }, { opacity: 1, x: 0, duration: 0.3, stagger: 0.04, delay: 0.15 });
        const firstCards = page.querySelectorAll<HTMLElement>('[data-cards] > *');
        if (firstCards.length) {
          gsap.fromTo(firstCards, { y: 12 }, { y: 0, duration: 0.4, stagger: 0.03, delay: 0.2, ease: 'power2.out' });
        }
      }
      if (heroRoot) heroRoot.style.opacity = '1';
    },
    undefined,
    1.0,
  );
}
