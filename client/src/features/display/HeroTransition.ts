import { CATEGORIES } from 'shared/types';
import { gsap } from 'gsap';

/**
 * Signature moment: clone-based shared-element transition (03-pages §Transition).
 * Manual FLIP with getBoundingClientRect capture + fixed overlay — transforms
 * and opacity only. Reduced motion: skip overlay entirely; 250ms crossfade.
 *
 * Overlay lifecycle (owner = App shell):
 *  0. capture label rects on the hero → create overlay clones at those rects
 *  1. 0–0.35s   hero fades to 12%; clones scale 1→2.2 in place; rules → 40vw
 *  2. t=0.15s   route swaps to /resources beneath (page itself opacity 0)
 *  3. 0.35–0.75s clones fly to the incoming section-title rects
 *  4. 0.75–1.1s clones fade out as real titles fade in; rules wipe; overlay unmounts
 */

export interface TransitionHandles {
  start: (opts: { reduced: boolean; swapRoute: () => void; onDone: () => void }) => void;
}

export function startHeroTransition(opts: {
  reduced: boolean;
  swapRoute: () => void;
  onDone: () => void;
}): void {
  const { reduced, swapRoute, onDone } = opts;

  // reduced motion: 250ms crossfade, no overlay
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

  const labels = Array.from(
    document.querySelectorAll<HTMLElement>('[data-showcase-label]'),
  )
    // only the docked/visible copy of each label (first occurrence per category)
    .filter((el, i, arr) => arr.findIndex((x) => x.dataset.cat === el.dataset.cat) === i)
    .sort(
      (a, b) =>
        CATEGORIES.findIndex((c) => c.id === a.dataset.cat) -
        CATEGORIES.findIndex((c) => c.id === b.dataset.cat),
    );

  if (labels.length === 0) {
    swapRoute();
    onDone();
    return;
  }

  // ── 0. prep: capture rects, create overlay ────────────────────────────
  const sourceRects = labels.map((el) => el.getBoundingClientRect());
  const overlay = document.createElement('div');
  overlay.setAttribute('data-transition-overlay', '');
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:1000;pointer-events:none;will-change:transform,opacity;';
  document.body.appendChild(overlay);

  const clones = labels.map((el, i) => {
    const clone = el.cloneNode(true) as HTMLElement;
    const r = sourceRects[i];
    clone.style.cssText = `
      position: fixed;
      left: ${r.left}px; top: ${r.top}px;
      width: ${r.width}px; height: ${r.height}px;
      margin: 0;
      font-family: var(--font-display);
      font-size: 30px;
      font-weight: 600;
      color: var(--ink);
      line-height: 1.15;
      transform-origin: left center;
      will-change: transform, opacity;
    `;
    overlay.appendChild(clone);
    return clone;
  });
  const rules = labels.map((_, i) => {
    const rule = document.createElement('span');
    const r = sourceRects[i];
    rule.style.cssText = `
      position: fixed;
      left: ${r.left}px; top: ${r.bottom + 6}px;
      height: 3px; width: 64%;
      border-radius: 2px;
      background: var(--cat-${labels[i].dataset.cat});
      transform-origin: left center;
      will-change: transform, opacity;
    `;
    overlay.appendChild(rule);
    return rule;
  });

  const heroRoot = document.querySelector('[data-hero-root]') as HTMLElement | null;
  const tl = gsap.timeline({
    onComplete: () => {
      overlay.remove();
      onDone();
    },
  });

  // ── 1. 0–0.35s: hero fades, clones scale up in place, rules stretch ──
  if (heroRoot) tl.to(heroRoot, { opacity: 0.12, duration: 0.35, ease: 'power2.out' }, 0);
  tl.to(
    clones,
    { scale: 2.2, duration: 0.35, ease: 'power2.inOut', transformOrigin: 'left center' },
    0,
  );
  tl.to(
    rules,
    { scaleX: () => Math.min(2.2, (window.innerWidth * 0.4) / (rules[0].getBoundingClientRect().width || 1)), duration: 0.35, ease: 'power2.inOut' },
    0,
  );

  // ── 2. t=0.15s: route swap beneath the overlay ─────────────────────────
  tl.call(swapRoute, undefined, 0.15);

  // ── 3. 0.35–0.75s: fly clones to incoming section titles ──────────────
  const flyToTargets = () =>
    clones.map((clone, i) => {
      const target = document.querySelector<HTMLElement>(
        `[data-content-page] #${labels[i].dataset.cat} [data-section-title]`,
      );
      if (!target) return { clone, dx: 0, dy: 0, sx: 1, alpha: 0 };
      const tr = target.getBoundingClientRect();
      const cr = clone.getBoundingClientRect();
      const dx = tr.left - cr.left;
      const dy = tr.top - cr.top;
      // current scale comes from the tween; compute target scale to match width
      const currentScale = cr.width / sourceRects[i].width;
      const targetScale = 1; // section titles render at their own size
      return { clone, dx, dy, sx: targetScale / currentScale, alpha: 1 };
    });

  tl.to(
    {
      // proxy object so the targets are measured at the right moment
      p: 0,
    },
    {
      p: 1,
      duration: 0.0001,
    },
    0.35,
  );
  tl.call(() => {
    const flights = flyToTargets();
    for (const f of flights) {
      gsap.to(f.clone, {
        x: f.dx,
        y: f.dy,
        scale: f.sx,
        duration: 0.4,
        ease: 'power3.inOut',
      });
      const label = labels[clones.indexOf(f.clone)];
      const ruleEl = rules[clones.indexOf(f.clone)];
      const target = document.querySelector<HTMLElement>(
        `[data-content-page] #${label.dataset.cat} [data-section-title]`,
      );
      if (target && ruleEl) {
        const tr = target.getBoundingClientRect();
        const rr = ruleEl.getBoundingClientRect();
        gsap.to(ruleEl, {
          x: tr.left - rr.left,
          y: tr.bottom - rr.top,
          scaleX: 1,
          duration: 0.4,
          ease: 'power3.inOut',
        });
      }
    }
  }, undefined, 0.35);

  // ── 4. 0.75–1.1s: clones fade, real titles/rules/TOC/cards reveal ────
  tl.to(clones, { opacity: 0, duration: 0.2, stagger: 0.04, ease: 'power1.out' }, 0.75);
  tl.to(rules, { opacity: 0, duration: 0.2, stagger: 0.04, ease: 'power1.out' }, 0.78);
  tl.call(() => {
    const page = document.querySelector('[data-content-page]');
    if (page instanceof HTMLElement) {
      page.style.transition = 'opacity 300ms ease';
      page.style.opacity = '1';
      // rule wipe + tick stagger + card rise
      page.querySelectorAll<HTMLElement>('[data-rule]').forEach((rule, i) => {
        gsap.fromTo(
          rule,
          { scaleX: 0 },
          { scaleX: 1, duration: 0.5, delay: i * 0.06, ease: 'power2.out' },
        );
      });
      const ticks = page.querySelectorAll<HTMLElement>('[data-toc-tick]');
      gsap.fromTo(
        ticks,
        { opacity: 0, x: 12 },
        { opacity: 1, x: 0, duration: 0.3, stagger: 0.04, delay: 0.2 },
      );
      const firstCards = page.querySelectorAll<HTMLElement>('[data-cards] > *');
      if (firstCards.length) {
        gsap.fromTo(
          firstCards,
          { y: 12 },
          { y: 0, duration: 0.4, stagger: 0.03, delay: 0.25, ease: 'power2.out' },
        );
      }
    }
  }, undefined, 0.75);

  // incoming page starts hidden until step 4
  tl.call(
    () => {
      const page = document.querySelector('[data-content-page]');
      if (page instanceof HTMLElement) page.style.opacity = '0';
    },
    undefined,
    0.16,
  );

  if (heroRoot) {
    tl.set(heroRoot, { opacity: 1 }, 1.05);
  }
}
