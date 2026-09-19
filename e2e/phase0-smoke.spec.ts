import { test, expect } from '@playwright/test';

/**
 * Phase 0 acceptance: dev client serves with the full token system;
 * logo renders top-left; fonts are self-hosted (no third-party font fetches).
 */
test('hero placeholder serves with logo top-left and self-hosted fonts', async ({ page }) => {
  const fontRequests: string[] = [];
  page.on('request', (req) => {
    if (/fonts\.googleapis|fonts\.gstatic/.test(req.url())) fontRequests.push(req.url());
  });

  await page.goto('/');
  const logo = page.locator('header img, a img[alt=""]').first();
  await expect(logo).toBeVisible();

  // logo sits in the top-left region
  const box = await logo.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeLessThan(160);
  expect(box!.y).toBeLessThan(120);

  // fonts actually applied on the heading
  const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(font.toLowerCase()).toContain('public sans');

  // no Google Fonts calls
  expect(fontRequests).toEqual([]);
});
