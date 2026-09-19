import { test, expect } from '@playwright/test';

/**
 * Phase 3 acceptance — display scenario #3 up to arrival on /resources
 * (01-architecture §8): hero renders → transition → arrival; animation purity
 * (transform/opacity only); reduced-motion crossfade.
 */

test('hero renders with animated title, tinted keywords, drifting showcase', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.hero-title')).toBeVisible();
  // BlurText words reveal (title settles) then reveal body fades in
  await expect(page.locator('.hero-reveal.is-in')).toBeVisible({ timeout: 8_000 });

  // copy deck verbatim
  await expect(page.getByText('Discover Opportunities Beyond the Classroom')).toBeVisible();
  await expect(
    page.getByText(/Leadership development does not happen in a single program/),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Get started!' })).toBeVisible();

  // after title settles, VariableProximity takes over (wght/opsz hover effect)
  await expect(page.locator('.hero-title-vp')).toBeVisible({ timeout: 8_000 });

  // keyword tints present (experiences/Fellowships/Event/Conference)
  const tinted = page.locator('.hero-keyword');
  expect(await tinted.count()).toBe(4);

  // showcase strip: 5 unique labels + drift transform applied (desktop)
  expect(await page.locator('.showcase-item').count()).toBe(15);
  await page.waitForTimeout(400);
  const transform = await page.evaluate(
    () => document.querySelector('.showcase-list')?.style.transform ?? '',
  );
  expect(transform).toContain('translate3d');

  // docked emphasis: exactly one item docked
  expect(await page.locator('.showcase-item.is-docked').count()).toBe(1);

  // hover pauses drift (transform frozen)
  await page.locator('.showcase').hover();
  const t1 = await page.evaluate(() => document.querySelector('.showcase-list')?.style.transform);
  await page.waitForTimeout(350);
  const t2 = await page.evaluate(() => document.querySelector('.showcase-list')?.style.transform);
  expect(t1).toBe(t2);
});

test('CTA runs the clone-flight transition and lands on /resources', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.hero-reveal.is-in')).toBeVisible({ timeout: 8_000 });

  await page.getByRole('button', { name: 'Get started!' }).click();

  // overlay appears mid-transition with 5 clone labels + rules, transform-only motion
  await page.waitForTimeout(250);
  const overlay = page.locator('[data-transition-overlay]');
  await expect(overlay).toBeVisible();
  const clone = overlay.locator('[data-cat]').first();
  const sample = await page.evaluate(() => {
    const clones = document.querySelectorAll('[data-transition-overlay] [data-cat]');
    const el = clones[0] as HTMLElement;
    const before = { transform: el.style.transform, left: el.style.left, top: el.style.top };
    return new Promise((resolve) => {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          const after = { transform: el.style.transform, left: el.style.left, top: el.style.top };
          resolve({ before, after });
        }),
      );
    });
  });
  // position (layout) untouched while transform changes → no layout props animated
  const s = sample as { before: { left: string; top: string }; after: { left: string; top: string } };
  expect(s.after.left).toBe(s.before.left);
  expect(s.after.top).toBe(s.before.top);

  // mid-flight the route already swapped beneath the overlay
  await page.waitForTimeout(150);
  expect(page.url()).toContain('/resources');

  // overlay unmounts; sections + cards arrived
  await expect(overlay).toHaveCount(0, { timeout: 5_000 });
  await expect(page).toHaveURL(/\/resources$/);
  expect(await page.locator('[data-section-title]').count()).toBe(5);
  expect(await page.locator('.opportunity-card').count()).toBeGreaterThan(0);
});

test('reduced motion: static title, no drift, crossfade instead of overlay', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('/');

  // no BlurText animation — static title renders immediately
  await expect(page.locator('.hero-title-static')).toBeVisible();
  // reveal fades in within ~200ms budget
  await expect(page.locator('.hero-reveal.is-in')).toBeVisible({ timeout: 2_000 });

  // no showcase drift
  await page.waitForTimeout(400);
  const transform = await page.evaluate(
    () => document.querySelector('.showcase-list')?.style.transform ?? '',
  );
  expect(transform === '' || transform === 'none').toBe(true);

  // CTA → 250ms crossfade, no overlay, straight to /resources
  await page.getByRole('button', { name: 'Get started!' }).click();
  await page.waitForTimeout(600);
  expect(page.url()).toContain('/resources');
  expect(await page.locator('[data-transition-overlay]').count()).toBe(0);
  await ctx.close();
});
