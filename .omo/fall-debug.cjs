const { chromium } = require('@playwright/test');
(async () => {
  const b = await chromium.launch();
  const page = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR:', String(e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('CONSOLE', m.text().slice(0, 150)); });
  await page.goto('http://localhost:5173/');
  for (const ms of [500, 1500, 3000]) {
    await page.waitForTimeout(ms === 500 ? 500 : 1000);
    const st = await page.evaluate(() => {
      const spans = [...document.querySelectorAll('.hero-fall-bed span')];
      const tops = spans.slice(0, 5).map((s) => Math.round(s.getBoundingClientRect().top));
      const rest = spans.map((s) => Math.round(s.getBoundingClientRect().top));
      return { n: spans.length, first5: tops, min: Math.min(...rest), max: Math.max(...rest) };
    });
    console.log(`t≈${ms}ms:`, JSON.stringify(st));
  }
  await b.close();
})();
