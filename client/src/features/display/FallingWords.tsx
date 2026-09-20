import { useEffect, useRef } from 'react';
import Matter from 'matter-js';
import { CATEGORIES } from 'shared/types';

/**
 * Falling words v2 (client revision 2, item 1.4/1.5):
 * - three tidy rows of words spawn at the very top (some with category-color
 *   chip backgrounds, some plain) and start dropping immediately on load
 * - words fall fast, randomly scaling up/down and wobbling left-right
 * - below ~2/3 viewport their opacity starts fading to a final 50%
 * - words pile up messily at the bottom of the screen
 * - draggable: words follow the mouse while held, then fall naturally
 *
 * Own component (Matter.js) — the vendored react-bits FallingText could not
 * express the top-spawn / fade-band / drag behaviors (recorded in questions.md).
 * All motion is physics-driven; DOM spans are synced to bodies per frame.
 */

export interface FallingWordsProps {
  /** words to drop, in tidy row order */
  words: string[];
  className?: string;
  /** fires once, when the words' descent passes ~2/3 of the viewport */
  onDropped?: () => void;
}

interface WordBody {
  body: Matter.Body;
  elem: HTMLElement;
  slot: number; // even target x across the viewport
  startX: number;
}

const ROWS = 3;

export function FallingWords({ words, className, onDropped }: FallingWordsProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const droppedRef = useRef(false);
  const onDroppedRef = useRef(onDropped);
  onDroppedRef.current = onDropped;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const { Engine, Render, World, Bodies, Runner, Mouse, MouseConstraint, Composite, Body } = Matter;

    const W = () => window.innerWidth;
    const H = () => window.innerHeight;

    // ── spawn three tidy rows pinned to the very top ────────────────────
    const stage = document.createElement('div');
    stage.style.cssText = 'position:absolute;inset:0;overflow:hidden;';
    host.appendChild(stage);

    // mixed sizes and green/blue tints (request 1b): rotate between the
    // theme's green and blue ramp steps per word
    const TINTS = ['#3E7A5C', '#33605B', '#336472', '#3F5F85', '#465891'];
    const spans: HTMLSpanElement[] = [];
    const perRow = Math.ceil(words.length / ROWS);
    for (let r = 0; r < ROWS; r++) {
      const rowWords = words.slice(r * perRow, (r + 1) * perRow);
      const rowEl = document.createElement('div');
      rowEl.style.cssText =
        'position:absolute;top:' + (4 + r * 34) + 'px;left:0;right:0;display:flex;justify-content:space-between;padding:0 32px;flex-wrap:nowrap;white-space:nowrap;';
      rowWords.forEach((w, i) => {
        const s = document.createElement('span');
        const isChip = Math.random() < 0.45;
        const tint = TINTS[(r * perRow + i) % TINTS.length];
        const size = 14 + ((r * perRow + i) * 7) % 15; // deterministic spread 14–28px
        s.textContent = w;
        s.style.cssText = [
          'display:inline-block',
          'font-family:var(--font-body)',
          `font-size:${size}px`,
          'font-weight:600',
          'padding:' + (isChip ? '2px 10px' : '2px 2px'),
          'border-radius:0', /* square corners (request 4b) */
          isChip ? `background:color-mix(in srgb, ${tint} 16%, white)` : '',
          isChip ? `color:${tint}` : `color:${tint}`,
          'white-space:nowrap',
          'user-select:none',
        ]
          .filter(Boolean)
          .join(';');
        rowEl.appendChild(s);
        spans.push(s);
      });
      stage.appendChild(rowEl);
    }

    // ── physics world ───────────────────────────────────────────────────
    const engine = Engine.create();
    engine.world.gravity.y = 1.6; // fast fall
    const render = Render.create({
      element: stage,
      engine,
      options: { width: W(), height: H(), background: 'transparent', wireframes: false },
    });
    // hide matter's own canvas visuals — DOM spans are the visual layer
    (render.canvas as HTMLCanvasElement).style.display = 'none';

    const wallOpts = { isStatic: true, render: { fillStyle: 'transparent' } };
    const floor = Bodies.rectangle(W() / 2, H() + 40, W() * 3, 80, wallOpts);
    const left = Bodies.rectangle(-40, H() / 2, 80, H() * 3, wallOpts);
    const right = Bodies.rectangle(W() + 40, H() / 2, 80, H() * 3, wallOpts);

    const wordBodies: WordBody[] = spans.map((elem, i) => {
      const rect = elem.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const body = Bodies.rectangle(cx, cy, rect.width, rect.height, {
        restitution: 0.05,
        frictionAir: 0.01,
        friction: 0.8,
        chamfer: { radius: 2 },
        render: { fillStyle: 'transparent' },
      });
      // EVEN distribution (request 4b): each word gets an evenly spaced
      // target slot across the viewport. Physics owns the vertical fall and
      // the pile-up height; the horizontal position is steered toward the
      // slot during the fall (x blend below), so the bottom coverage is
      // uniform regardless of collisions. Drag still works — the steering
      // only runs while a word is above the settle line.
      const slot = ((i + 0.5) / spans.length) * W();
      Body.setVelocity(body, { x: 0, y: 2 + (i % 3) });
      Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.04); // gentle tilt
      // rects were read in flow layout; from now on the spans are positioned
      // absolutely and synced to their physics bodies per frame
      elem.style.position = 'absolute';
      elem.style.left = '0px';
      elem.style.top = '0px';
      return { body, elem, slot, startX: cx };
    });

    const mouse = Mouse.create(host);
    const mc = MouseConstraint.create(engine, {
      mouse,
      constraint: { stiffness: 0.12, render: { visible: false } },
    });
    render.mouse = mouse;
    Composite.add(engine.world, [floor, left, right, mc, ...wordBodies.map((w) => w.body)]);

    const runner = Runner.create();
    Runner.run(runner, engine);
    Render.run(render);

    // ── per-frame sync + the 2/3 fade band ──────────────────────────────
    let raf = 0;
    const fadeStart = () => H() * (2 / 3);
    const settleLine = () => H() * 0.86;
    const loop = () => {
      const fs = fadeStart();
      let lowest = 0;
      for (const { body, elem, slot, startX } of wordBodies) {
        // horizontal steering toward the even slot while the word is still
        // falling above the settle line (words already settling keep their
        // physics positions; dragging is unaffected because the steer pauses
        // once the word has crossed the line)
        if (body.position.y < settleLine() && body.position.y > H() * 0.18) {
          const p = body.position.y / settleLine(); // 0..1 fall progress
          const eased = p * p * (3 - 2 * p); // smoothstep
          const wanted = startX + (slot - startX) * Math.min(1, eased);
          Body.setPosition(body, { x: wanted, y: body.position.y });
          Body.setVelocity(body, { x: 0, y: body.velocity.y });
        }
        const { x, y } = body.position;
        elem.style.left = `${x}px`;
        elem.style.top = `${y}px`;
        elem.style.transform = `translate(-50%, -50%) rotate(${body.angle}rad)`;
        // fade in only below the 2/3 band: 1 → 0.45 (request 1b: −10%)
        const fade = y > fs ? Math.max(0.45, 1 - ((y - fs) / (H() * 0.35)) * 0.55) : 1;
        elem.style.opacity = String(fade);
        if (y > lowest) lowest = y;
      }
      // notify the host once the wave has passed the 2/3 mark (request 1.5)
      if (!droppedRef.current && wordBodies.length > 0 && lowest > fs) {
        droppedRef.current = true;
        if (onDroppedRef.current) onDroppedRef.current();
      }
      raf = requestAnimationFrame(loop);
    };
    loop();

    const onResize = () => {
      Render.setSize(render, W(), H());
      // keep the floor under the new viewport
      Body.setPosition(floor, { x: W() / 2, y: H() + 40 });
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      Render.stop(render);
      Runner.stop(runner);
      World.clear(engine.world, false);
      Engine.clear(engine);
      stage.remove();
    };
  }, [words]);

  return <div ref={hostRef} className={className ?? 'fixed inset-0 z-[1]'} />;
}

export const FALLING_CHIP_TINTS = CATEGORIES.map((c) => c.tint);
