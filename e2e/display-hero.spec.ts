import { test, expect } from '@playwright/test';

/**
 * Display hero spec — v2 (client revisions): sequential 2s reveal, CursorGrid,
 * falling-letters bed, faster showcase, panel-word transition.
 */

test('hero: title bolder, subtitle styled, 2s sequential reveal completes', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.hero-title')).toBeVisible();

  // title font-weight 740+
  const weight = await page.locator('.hero-title').evaluate((el) => getComputedStyle(el).fontWeight);
  expect(Number(weight)).toBeGreaterThanOrEqual(700);

  // subtitle: tinted + underlined + larger
  const sub = page.locator('.hero-subtitle');
  await expect(sub).toBeVisible();
  const subStyle = await sub.evaluate((el) => {
    const s = getComputedStyle(el);
    return { deco: s.textDecorationLine, size: parseFloat(s.fontSize) };
  });
  expect(subStyle.deco).toContain('underline');
  expect(subStyle.size).toBeGreaterThanOrEqual(24);

  // sequential reveal completes: CTA fully opaque by ~2s after settle
  await expect
    .poll(
      async () =>
        Number(await page.locator('.hero-cta').evaluate((el) => getComputedStyle(el).opacity)),
      { timeout: 8_000 },
    )
    .toBeGreaterThan(0.9);
  await expect(page.locator('.hero-body')).toBeVisible();

  // copy deck verbatim
  await expect(page.getByText('Discover Opportunities Beyond the Classroom')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Get started!' })).toBeVisible();

  // cursor grid canvas present (mouse effect layer)
  expect(await page.locator('.hero-cursor-grid canvas').count()).toBe(1);

  // falling-letters bed present
  expect(await page.locator('.hero-fall-bed').count()).toBe(1);

  // VariableProximity takes over after settle
  await expect(page.locator('.hero-title-vp')).toBeVisible({ timeout: 8_000 });
});

test('showcase drifts faster and docks exactly one row', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.showcase-item').first()).toBeVisible();

  const t1 = await page.evaluate(() => document.querySelector('.showcase-list')?.style.transform ?? '');
  await page.waitForTimeout(700);
  const t2 = await page.evaluate(() => document.querySelector('.showcase-list')?.style.transform ?? '');
  expect(t1).not.toBe(t2);

  // parse Y offsets (transform is like "translate3d(0, -504.2px, 0)") to
  // confirm the faster drift speed
  const yOf = (t) => Math.abs(Number(/translate3d\([^,]+, (-?[\d.]+)px/.exec(t)?.[1] ?? 0));
  const y1 = yOf(t1);
  const y2 = yOf(t2);
  const moved = Math.abs(y2 - y1);
  expect(moved).toBeGreaterThan(8);

  expect(await page.locator('.showcase-item.is-docked').count()).toBe(1);

  // hover pauses
  await page.locator('.showcase').hover();
  const p1 = await page.evaluate(() => document.querySelector('.showcase-list')?.style.transform ?? '');
  await page.waitForTimeout(350);
  const p2 = await page.evaluate(() => document.querySelector('.showcase-list')?.style.transform ?? '');
  expect(p1).toBe(p2);
});

test('transition: color panels + giant words converge; lands on /resources', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.hero-cta')).toBeVisible({ timeout: 12_000 });

  await page.getByRole('button', { name: 'Get started!' }).click();

  // overlay appears with 5 panels + 5 words (single poll to avoid mid-flight
  // stalls under load)
  const overlayReady = await page
    .waitForFunction(
      () => {
        const o = document.querySelector('[data-transition-overlay]');
        if (!o) return false;
        return (
          o.querySelectorAll('[data-transition-panel]').length === 5 &&
          o.querySelectorAll('[data-transition-word]').length === 5
        );
      },
      null,
      { timeout: 4_000 },
    )
    .then(() => true)
    .catch(() => false);
  expect(overlayReady).toBe(true);

  // mid-flight the route swapped beneath the overlay
  await page.waitForTimeout(300);
  expect(page.url()).toContain('/resources');

  // overlay unmounts; sections arrived
  const overlay = page.locator('[data-transition-overlay]');
  await expect(overlay).toHaveCount(0, { timeout: 6_000 });
  await expect(page).toHaveURL(/\/resources$/);
  await expect(page.locator('[data-section-title]')).toHaveCount(5, { timeout: 10_000 });
  await expect(page.locator('.opportunity-card').first()).toBeVisible({ timeout: 10_000 });

  // nothing overflows horizontally (request: words must not fly off-page)
  const overflowX = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflowX).toBeLessThanOrEqual(1);
});

test('reduced motion: static title, crossfade, no overlay/no canvas layers', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('/');

  await expect(page.locator('.hero-title-static')).toBeVisible();
  await expect(page.locator('.hero-cta')).toBeVisible({ timeout: 3_000 });
  // no cursor grid / falling bed under reduced motion
  expect(await page.locator('.hero-cursor-grid').count()).toBe(0);
  expect(await page.locator('.hero-fall-bed').count()).toBe(0);

  await page.getByRole('button', { name: 'Get started!' }).click();
  await expect(page).toHaveURL(/\/resources$/, { timeout: 4_000 });
  expect(await page.locator('[data-transition-overlay]').count()).toBe(0);
  await ctx.close();
});
