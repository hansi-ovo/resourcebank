import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { displayImageUrl } from '@/lib/format';
import { CATEGORIES, type PublishedSection } from 'shared/types';

/**
 * Showcase wheel (client revision 7, item 1b) — the right-hand hero strip
 * rebuilt to tasteskill.dev's measured hero-carousel geometry. The site's
 * SSR DOM snapshot exposes 7 <figure> samples along one shared path; from
 * those samples the exact transform laws were recovered and verified at
 * every sample:
 *
 *   u        = (z + 1000) / 1274                (depth, 0 spawn → 1 front)
 *   scale    = 0.44 + 0.74·u
 *   opacity  = u^0.566
 *   rotateX  = 4° − 2°·u
 *   zIndex   = 20 + 80·u
 *   rotateY  = −3° + 7.14°·p                    (linear along the path)
 *
 * Path anchors (x/y % of card size, z px), sampled at p = k/6 — cards
 * enter at the top (slightly off-center), land front-and-center at
 * p = 1/3 (nearest, brightest), then sweep a quarter-arc to the
 * bottom-right exit while receding:
 *
 *   p=0     x=-10      y=-300     z=-1000    (spawn, invisible)
 *   p=1/6   x=-10      y=-168.8   z=-140.5
 *   p=2/6   x=-10      y=-37.6    z=+273.8   (FRONT)
 *   p=3/6   x=+52.7    y=+65.8    z=+142.2
 *   p=4/6   x=+183.5   y=+70      z=-317.8
 *   p=5/6   x=+314.8   y=+70      z=-972.3   (exit, invisible)
 *
 * Image-only cards (project names removed), rounded corners, 6 slots
 * spaced 1/6 of the path apart — tasteskill's 7th <figure> is just the
 * wrap duplicate of the spawn card. Content items re-seed into slots as
 * they wrap, so the whole catalog cycles through. Driven by wheel scroll,
 * drag (with inertia) and a slow auto-rotation that pauses on hover.
 */

interface WheelItem {
  name: string;
  image: string | null;
  tint: string;
}

function toWheelItems(sections: PublishedSection[]): WheelItem[] {
  const flat: WheelItem[] = [];
  for (const s of sections) {
    for (const e of s.entries) {
      flat.push({ name: e.name, image: displayImageUrl(e.imageUrl), tint: s.category.tint });
    }
  }
  return flat;
}

const AUTO_CARD_S = 2.6; // one card past the front every ~2.6s (tasteskill pace)
const WHEEL_K = 0.00045; // phase per wheel deltaY px
const DRAG_K = 0.0021; // phase per drag px
const SLOTS = 6; // 6 intervals over the path = tasteskill's card spacing

// measured path anchors at p = k/6 (k = 0..6); x/y in % of card size, z in px
const AX = [-10, -10, -10, 52.737, 183.526, 314.751, 445];
const AY = [-300, -168.775, -37.551, 65.771, 70, 70, 70];
const AZ = [-1000, -140.54, 273.8, 142.25, -317.8, -972.33, -1620];
const Z_SPAWN = -1000;
const Z_FRONT = 273.8;
const DEPTH = Z_FRONT - Z_SPAWN;

/** Catmull-Rom spline through the measured anchors — hits every sample. */
function samplePath(p: number): { x: number; y: number; z: number } {
  const f = p * SLOTS;
  const k = Math.min(SLOTS - 1, Math.floor(f));
  const t = f - k;
  const pick = (arr: number[], j: number) => arr[Math.max(0, Math.min(arr.length - 1, j))];
  const cr = (a: number, b: number, c: number, d: number) => {
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      0.5 *
      (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
    );
  };
  return {
    x: cr(pick(AX, k - 1), AX[k], AX[k + 1], pick(AX, k + 2)),
    y: cr(pick(AY, k - 1), AY[k], AY[k + 1], pick(AY, k + 2)),
    z: cr(pick(AZ, k - 1), AZ[k], AZ[k + 1], pick(AZ, k + 2)),
  };
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function ShowcaseWheel({ reduced }: { reduced: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const planeRef = useRef<HTMLDivElement>(null);
  const [items, setItems] = useState<WheelItem[] | null>(null);

  useEffect(() => {
    let alive = true;
    void api
      .get<PublishedSection[]>('/api/published')
      .then((sections) => {
        if (!alive) return;
        setItems(toWheelItems(sections));
      })
      .catch(async () => {
        // No API reachable (e.g. single-file export opened via file://) —
        // fall back to the embedded demo snapshot so the wheel still shows.
        // Dynamic import keeps the snapshot out of normal production bundles.
        if (!alive) return;
        const { DEMO_SECTIONS } = await import('@/lib/demoSnapshot');
        if (alive) setItems(toWheelItems(DEMO_SECTIONS));
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    const plane = planeRef.current;
    if (!root || !plane) return;
    const cards = Array.from(plane.children) as HTMLElement[];
    if (cards.length === 0) return;
    const S = cards.length;

    let phase = 0;
    let vel = 0; // drag inertia, phase units per frame
    let hovering = false;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let raf = 0;
    let last = performance.now();

    // content assignment: slot i shows items[slotItem[i]]; when a slot wraps
    // the p boundary it re-seeds with the next catalog item, so every entry
    // gets screen time regardless of catalog size
    const slotItem: number[] = [];
    const prevP: number[] = [];
    let next = 0;
    for (let i = 0; i < S; i++) {
      slotItem.push(items && items.length > 0 ? i % items.length : -1);
      prevP.push(i / S);
    }
    next = S;

    const apply = () => {
      const list = items ?? [];
      for (let i = 0; i < S; i++) {
        const el = cards[i];
        if (list.length === 0 || slotItem[i] < 0) {
          el.style.opacity = '0';
          continue;
        }
        const p = (((i / S + phase) % 1) + 1) % 1;
        // wrap detection: slot crossed the p=0/1 boundary
        if (Math.abs(p - prevP[i]) > 0.5) {
          slotItem[i] = next % list.length;
          next++;
        }
        prevP[i] = p;

        const item = list[slotItem[i] % list.length];
        const { x, y, z } = samplePath(p);
        const u = clamp01((z - Z_SPAWN) / DEPTH); // 0 spawn → 1 front
        const scale = 0.44 + 0.74 * u;
        // rev 8 (request 2): cards enter at FULL opacity — no per-image
        // fade-in anywhere on the path; they only dim slightly once they
        // dip below the scene's front zone (y > 70) on the exit leg
        const belowFront = Math.max(0, y - 70) / 30; // 0 → 1 past y=100
        const opacity = 1 - 0.35 * belowFront;

        const img = el.querySelector('.showcase-wheel-img') as HTMLElement | null;
        if (img) {
          img.style.setProperty('--cat', item.tint);
          const imgEl = img.querySelector('img');
          const fbEl = img.querySelector('.showcase-wheel-fallback');
          if (item.image) {
            if (imgEl && imgEl.getAttribute('src') !== item.image) {
              imgEl.setAttribute('src', item.image);
            }
            if (imgEl) imgEl.style.display = '';
            if (fbEl) (fbEl as HTMLElement).style.display = 'none';
          } else if (fbEl) {
            if (imgEl) imgEl.style.display = 'none';
            (fbEl as HTMLElement).style.display = '';
            (fbEl as HTMLElement).textContent = item.name.slice(0, 1);
          }
        }

        el.style.transform =
          `translate3d(calc(-50% + ${x.toFixed(2)}%), calc(-50% + ${y.toFixed(2)}%), ${z.toFixed(1)}px) ` +
          `rotateX(${(4 - 2 * u).toFixed(2)}deg) rotateY(${(-3 + 7.14 * p).toFixed(2)}deg) rotateZ(0deg) ` +
          `scale(${scale.toFixed(4)})`;
        el.style.opacity = opacity.toFixed(3);
        el.style.zIndex = String(Math.round(20 + 80 * u));
        el.style.pointerEvents = 'none';
      }
    };

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      // AUTO_CARD_S seconds per card ⇒ phase speed 1/(AUTO_CARD_S·S) per s
      if (!dragging && !hovering && !reduced) phase += dt / (AUTO_CARD_S * S);
      if (!dragging && Math.abs(vel) > 1e-5) {
        phase += vel;
        vel *= 0.93;
      }
      apply();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      phase += e.deltaY * WHEEL_K;
      vel = 0;
    };
    // hover pause — but keep wheel/drag responsive
    const onEnter = () => {
      hovering = true;
    };
    const onLeave = () => {
      hovering = false;
    };
    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      vel = 0;
      root.setPointerCapture(e.pointerId);
      root.classList.add('is-grabbing');
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      phase += (dx + dy * 0.6) * DRAG_K;
      vel = (dx + dy * 0.6) * DRAG_K * 0.55; // momentum seed
    };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      root.classList.remove('is-grabbing');
      if (root.hasPointerCapture(e.pointerId)) root.releasePointerCapture(e.pointerId);
    };

    root.addEventListener('wheel', onWheel, { passive: false });
    root.addEventListener('pointerenter', onEnter);
    root.addEventListener('pointerleave', onLeave);
    root.addEventListener('pointerdown', onDown);
    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerup', onUp);
    root.addEventListener('pointercancel', onUp);

    return () => {
      cancelAnimationFrame(raf);
      root.removeEventListener('wheel', onWheel);
      root.removeEventListener('pointerenter', onEnter);
      root.removeEventListener('pointerleave', onLeave);
      root.removeEventListener('pointerdown', onDown);
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerup', onUp);
      root.removeEventListener('pointercancel', onUp);
    };
  }, [items, reduced]);

  if (items !== null && items.length === 0) return null;

  return (
    <aside
      ref={rootRef}
      className="showcase-wheel"
      aria-label="Program showcase"
      data-showcase-wheel
    >
      <div className="showcase-wheel-scene">
        <div ref={planeRef} className="showcase-wheel-plane">
          {Array.from({ length: SLOTS }).map((_, i) => (
            <figure key={i} className="showcase-wheel-card" aria-hidden="true">
              <span className="showcase-wheel-img">
                <img alt="" loading="lazy" draggable={false} />
                <span className="showcase-wheel-fallback" />
              </span>
            </figure>
          ))}
        </div>
      </div>
    </aside>
  );
}

export const SHOWCASE_TINTS = CATEGORIES.map((c) => c.tint);
