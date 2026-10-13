// Visual QA probe: captures the display hero at three moments and reports
// the per-card geometry so the tasteskill clone can be checked numerically.
// Usage: node scripts/qa-wheel.mjs  (dev servers must be running)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../.omo/reviews/qa-wheel');
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto('http://localhost:5173/');
await page.waitForTimeout(3500); // words drop, title settles, wheel warms

const snap = () =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('.showcase-wheel-card')).map((el) => {
      const s = el.style;
      const img = el.querySelector('img');
      const r = el.getBoundingClientRect();
      return {
        transform: s.transform.slice(0, 90),
        opacity: s.opacity,
        z: s.zIndex,
        radius: getComputedStyle(el.querySelector('.showcase-wheel-img')).borderRadius,
        visible: r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0,
        caption: el.querySelector('figcaption')?.textContent ?? null,
        src: (img?.getAttribute('src') ?? '').split('/').pop(),
      };
    }),
  );

const s1 = await snap();
await page.screenshot({ path: path.join(OUT, 'hero-t1.png') });
await page.mouse.move(1100, 450);
await page.mouse.wheel(0, 600); // advance the path by hand
await page.waitForTimeout(250);
const s2 = await snap();
await page.screenshot({ path: path.join(OUT, 'hero-t2.png') });

// bottom word opacity check (request 1a)
const wordOpacity = await page.evaluate(() => {
  const spans = Array.from(document.querySelectorAll('.hero-fall-bed span'));
  const bottom = spans.filter((s) => s.getBoundingClientRect().top > innerHeight * 0.7);
  return bottom.slice(0, 8).map((s) => Number(getComputedStyle(s).opacity));
});

console.log(JSON.stringify({ cardsT1: s1, cardsT2: s2, bottomWordOpacity: wordOpacity }, null, 1));
await browser.close();
