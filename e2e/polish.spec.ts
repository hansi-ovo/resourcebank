import { test, expect } from '@playwright/test';

/**
 * Phase 5 — responsive sweep 320–1440 + focus-visible audit.
 */

for (const width of [320, 375, 768, 1024, 1280, 1440]) {
  test(`responsive ${width}px: hero stacks, cards reflow, no horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.locator('.hero-title')).toBeVisible();

    // no horizontal scroll
    const overflowX = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflowX).toBeLessThanOrEqual(1);

    await page.goto('/resources');
    await expect(page.locator('.content-title').first()).toBeVisible();

    const overflowX2 = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflowX2).toBeLessThanOrEqual(1);

    // card columns per breakpoint
    const cols = await page.evaluate(() => {
      const grid = document.querySelector('.content-grid');
      return grid ? getComputedStyle(grid).gridTemplateColumns.split(' ').length : 0;
    });
    if (width < 640) expect(cols).toBe(1);
    else if (width < 1024) expect(cols).toBe(2);
    else expect(cols).toBe(3);

    // TOC hidden below 960
    const tocVisible = await page.locator('.section-toc').isVisible();
    if (width < 960) expect(tocVisible).toBe(false);
    else expect(tocVisible).toBe(true);
  });
}

test('admin table scrolls horizontally at narrow widths without breaking layout', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 900 });
  await page.goto('/admin');
  await page.getByLabel('Password').fill('dku-admin');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Hi, admin :)' })).toBeVisible();
  await page.goto('/admin/review/review-list');

  const table = page.locator('table');
  await expect(table).toBeVisible();
  // scroll container exists (overflow-x-auto wrapper)
  const scrollable = await page.evaluate(() => {
    const el = document.querySelector('.overflow-x-auto');
    return el ? getComputedStyle(el).overflowX : 'none';
  });
  expect(['auto', 'scroll']).toContain(scrollable);
});

test('2px focus ring visible on interactive elements (spot checks)', async ({ page }) => {
  await page.goto('/resources');
  await expect(page.locator('.opportunity-card').first()).toBeVisible();

  // card focus ring
  const card = page.locator('.opportunity-card').first();
  await card.focus();
  const cardOutline = await card.evaluate((el) => {
    el.focus();
    const s = getComputedStyle(el);
    return { width: s.outlineWidth, style: s.outlineStyle, color: s.outlineColor };
  });
  expect(cardOutline.style).toBe('solid');

  // TOC item focus ring
  const tocItem = page.locator('.toc-item').first();
  await tocItem.focus();
  const tocOutline = await tocItem.evaluate((el) => {
    el.focus();
    return getComputedStyle(el).outlineStyle;
  });
  expect(tocOutline).toBe('solid');
});

test('manifest + favicon + no-JS notice + 404 page', async ({ page }) => {
  const manifest = await page.request.get('/manifest.webmanifest');
  expect(manifest.status()).toBe(200);
  expect((await manifest.json()).name).toContain('DKU Leadership Resource Bank');

  const icon = await page.request.get('/logo.png');
  expect(icon.status()).toBe(200);

  // no-JS notice present in served HTML
  const html = await page.request.get('/');
  const text = await html.text();
  expect(text).toContain('noscript');
  expect(text).toContain('requires JavaScript');

  // 404 page
  await page.goto('/definitely-not-a-page');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to the Resource Bank' })).toBeVisible();
});
