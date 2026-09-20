const { chromium } = require('@playwright/test');
const path = require('node:path');
const fs = require('node:fs');

(async () => {
  const OUT = '.omo/reviews/revision2';
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const page = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));

  // hero: words dropping at top (t=0.4s)
  await page.goto('http://localhost:5173/');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, '01-hero-words-dropping.png') });

  // hero: settled + copy revealed (t=3s)
  await page.waitForTimeout(2600);
  await page.screenshot({ path: path.join(OUT, '02-hero-settled.png') });
  const noScroll = await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 2);
  console.log('no-scroll:', noScroll);

  // click spark on hero (click empty area)
  await page.mouse.click(300, 500);
  await page.waitForTimeout(120);
  await page.screenshot({ path: path.join(OUT, '03-click-spark-hero.png') });

  // drag a word: pick a settled span, drag down-right
  const span = page.locator('.hero-fall-bed span').first();
  const box = await span.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 120, box.y + 60, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(OUT, '04-word-dragged.png') });
  }

  // transition to content page
  await page.getByRole('button', { name: 'Get started!' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '05-transition-mid.png') });
  await page.waitForSelector('[data-section-title]', { timeout: 10000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, '06-content-descriptions.png') });

  // TOC collapsed vs expanded
  await page.screenshot({ path: path.join(OUT, '07-toc-collapsed.png'), clip: { x: 1340, y: 300, width: 100, height: 300 } });
  await page.locator('.section-toc').hover();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, '08-toc-expanded.png'), clip: { x: 1150, y: 300, width: 290, height: 300 } });

  // modal: square corners + sticky close + rotation
  await page.locator('.opportunity-card').first().click();
  await page.waitForSelector('[role="dialog"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, '09-modal-top.png') });
  // scroll inside modal: close stays pinned
  await page.locator('.modal-card').evaluate((el) => (el.scrollTop = 400));
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(OUT, '10-modal-scrolled-close-pinned.png') });
  const closeBox = await page.locator('.modal-close').boundingBox();
  console.log('close button pos after scroll:', JSON.stringify(closeBox));
  await page.locator('.modal-close').hover();
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(OUT, '11-close-hover-rotate.png') });

  console.log('page errors:', JSON.stringify(errs.slice(0, 5)));
  await b.close();
  console.log('done ->', OUT);
})().catch((e) => {
  console.error('FAILED:', String(e).split('\n')[0]);
  process.exit(1);
});
