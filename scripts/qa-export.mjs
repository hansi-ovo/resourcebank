// QA probe for the single-file export build: opens client/dist-export/index.html
// via file:// (offline, no backend) and checks the hero plus the demo-snapshot
// catalog actually render.
// Usage: node scripts/qa-export.mjs
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file =
  'file:///' + path.resolve(__dirname, '../client/dist-export/index.html').replace(/\\/g, '/');
const OUT = path.resolve(__dirname, '../.omo/reviews/qa-export');
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));

// 1. hero renders from pure file:// (fonts/art must be inlined)
await page.goto(file);
await page.waitForTimeout(3500); // reveal sequence settles
const heroOk = await page.evaluate(() => {
  const t = document.querySelector('.hero-title');
  return !!t && t.textContent.length > 0;
});
// showcase wheel must be populated from the demo snapshot offline
const wheel = await page.evaluate(() => {
  const imgs = Array.from(document.querySelectorAll('.showcase-wheel-card img'));
  return {
    slots: imgs.length,
    withDataSrc: imgs.filter((i) => (i.getAttribute('src') ?? '').startsWith('data:')).length,
  };
});
await page.screenshot({ path: path.join(OUT, 'export-hero.png') });

// 2. catalog renders from the embedded demo snapshot (API unreachable here)
await page.goto(`${file}#/resources`);
await page.waitForTimeout(2500);
const cards = await page.evaluate(() =>
  Array.from(document.querySelectorAll('.opportunity-card')).map((el) => ({
    img: el.querySelector('img')?.getAttribute('src')?.slice(0, 22) ?? null,
    name: el.querySelector('.card-name')?.textContent ?? '',
  })),
);
await page.screenshot({ path: path.join(OUT, 'export-resources.png') });

const dataImgs = cards.filter((c) => c.img?.startsWith('data:')).length;
console.log(
  JSON.stringify(
    { heroOk, wheel, cardCount: cards.length, dataImgs, sample: cards.slice(0, 3), pageErrors },
    null,
    1,
  ),
);
await browser.close();
if (!heroOk || wheel.withDataSrc === 0 || cards.length === 0 || pageErrors.length > 0)
  process.exit(1);
