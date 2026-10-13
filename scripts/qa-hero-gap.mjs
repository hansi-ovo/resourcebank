// Measure hero geometry: logo→title gap, hero-left box, aside/scene boxes.
// Usage: node scripts/qa-hero-gap.mjs (dev servers running)
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
await page.goto('http://localhost:5173/');
await page.waitForTimeout(3500); // let the reveal sequence settle

const data = await page.evaluate(() => {
  const r = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    return { top: +b.top.toFixed(1), bottom: +b.bottom.toFixed(1), left: +b.left.toFixed(1), height: +b.height.toFixed(1) };
  };
  const logoImg = document.querySelector('.hero-header img');
  const title = document.querySelector('.hero-title');
  const left = document.querySelector('.hero-left');
  const aside = document.querySelector('[data-showcase-wheel]');
  const scene = document.querySelector('.showcase-wheel-scene');
  const plane = document.querySelector('.showcase-wheel-plane');
  return {
    logoImg: r(logoImg),
    title: r(title),
    left: r(left),
    aside: r(aside),
    scene: r(scene),
    plane: r(plane),
    heroMainPaddingTop: getComputedStyle(document.querySelector('.hero-main')).paddingTop,
    heroHeaderPaddingTop: getComputedStyle(document.querySelector('.hero-header')).paddingTop,
  };
});
console.log(JSON.stringify(data, null, 1));
await browser.close();
