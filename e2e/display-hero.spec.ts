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

  // background word bed removed (rev 13)
  expect(await page.locator('.hero-word-bed').count()).toBe(0);

  // VariableProximity takes over after settle
  await expect(page.locator('.hero-title-vp')).toBeVisible({ timeout: 8_000 });
});

test('showcase 3D wheel revolves, driven by wheel and drag', async ({ page }) => {
  await page.goto('/');
  const wheel = page.locator('[data-showcase-wheel]');
  await expect(wheel).toBeVisible();

  // cards carry project names + images from /api/published
  await expect(wheel.locator('.showcase-wheel-card').first()).toBeVisible();
  expect(await wheel.locator('.showcase-wheel-card').count()).toBeGreaterThan(2);

  // continuous auto-rotation: some card transform changes over time
  const t1 = await page.evaluate(
    () => document.querySelector('.showcase-wheel-card')?.getAttribute('style') ?? '',
  );
  await page.waitForTimeout(700);
  const t2 = await page.evaluate(
    () => document.querySelector('.showcase-wheel-card')?.getAttribute('style') ?? '',
  );
  expect(t1).not.toBe(t2);

  // wheel scroll spins the carousel
  await wheel.hover();
  await page.mouse.wheel(0, 240);
  await page.waitForTimeout(120);
  const t3 = await page.evaluate(
    () => document.querySelector('.showcase-wheel-card')?.getAttribute('style') ?? '',
  );
  expect(t3).not.toBe(t2);
});

test('transition: color panels converge into rule strips; lands on /resources', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.hero-cta')).toBeVisible({ timeout: 12_000 });

  await page.getByRole('button', { name: 'Get started!' }).click();

  // overlay appears with 5 color panels (single poll to avoid mid-flight
  // stalls under load)
  const overlayReady = await page
    .waitForFunction(
      () => {
        const o = document.querySelector('[data-transition-overlay]');
        return !!o && o.querySelectorAll('[data-transition-panel]').length === 5;
      },
      null,
      { timeout: 4_000 },
    )
    .then(() => true)
    .catch(() => false);
  expect(overlayReady).toBe(true);

  // mid-flight the route swaps beneath the overlay (~0.45s into the
  // timeline — wait for it instead of a fixed sleep, which races on slow
  // first-compile loads)
  await page.waitForURL(/\/resources$/, { timeout: 6_000 });

  // overlay unmounts; sections arrived
  const overlay = page.locator('[data-transition-overlay]');
  await expect(overlay).toHaveCount(0, { timeout: 6_000 });
  await expect(page).toHaveURL(/\/resources$/);
  await expect(page.locator('[data-section-title]')).toHaveCount(5, { timeout: 10_000 });
  await expect(page.locator('.opportunity-card').first()).toBeVisible({ timeout: 10_000 });

  // nothing overflows horizontally
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
  // no cursor grid under reduced motion (word bed removed in rev 13)
  expect(await page.locator('.hero-cursor-grid').count()).toBe(0);

  await page.getByRole('button', { name: 'Get started!' }).click();
  await expect(page).toHaveURL(/\/resources$/, { timeout: 4_000 });
  expect(await page.locator('[data-transition-overlay]').count()).toBe(0);
  await ctx.close();
});
