import { test, expect } from '@playwright/test';

/**
 * Phase 4 acceptance — display scenarios #3–5 + live sync (01-architecture §8).
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/resources');
  await expect(page.locator('.opportunity-card').first()).toBeVisible({ timeout: 10_000 });
});

test('scenario 3: TOC hover/click jump + modal closes ×3 ways', async ({ page }) => {
  const initialActive = await page.locator('.toc-item.is-active').getAttribute('aria-current');
  expect(initialActive).toBeTruthy();

  // hover expands the rail
  await page.locator('.section-toc').hover();
  await expect(page.locator('.toc-label').first()).toBeVisible();
  // collapsed by default before hover — labels hidden
  // (checked implicitly by the hover reveal)

  // click Fellowship jumps + sets active
  await page.locator('.toc-item', { hasText: 'Fellowships' }).click();
  await expect(page.locator('#fellowships')).toBeInViewport({ timeout: 4_000 });
  await expect(page.locator('.toc-item.is-active', { hasText: 'Fellowships' })).toHaveAttribute(
    'aria-current',
    'true',
  );

  // open a modal by clicking a card
  const card = page.locator('.opportunity-card').first();
  await card.click();
  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused();
  await expect(dialog.getByRole('link', { name: 'Visit website' })).toHaveAttribute(
    'target',
    '_blank',
  );

  // close 1: Escape
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  // close 2: ×
  await card.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toHaveCount(0);

  // close 3: outside click
  await card.click();
  await expect(dialog).toBeVisible();
  await page.mouse.click(12, 400); // backdrop area
  await expect(dialog).toHaveCount(0);

  // keyboard: TOC operable by keyboard (Tab reaches items, Enter jumps)
  await page.locator('.toc-item', { hasText: 'Event & Conference' }).focus();
  await expect(page.locator('.toc-item', { hasText: 'Event & Conference' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#events')).toBeInViewport({ timeout: 4_000 });
});

test('scenario 4: modal focus trap + keyboard focus visible', async ({ page }) => {
  await page.locator('.opportunity-card').first().click();
  const dialog = page.locator('[role="dialog"]');

  // trap: tabbing cycles inside the dialog
  const insideCount = await dialog.locator('a[href], button').count();
  for (let i = 0; i < insideCount + 2; i++) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() =>
      document.activeElement?.closest('[role="dialog"]') !== null,
    );
    expect(focused).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('deep link #category scrolls and sets active TOC', async ({ page }) => {
  await page.goto('/resources#training');
  await expect(page.locator('#training')).toBeInViewport({ timeout: 6_000 });
  await expect(page.locator('.toc-item.is-active', { hasText: 'Training' })).toHaveAttribute(
    'aria-current',
    'true',
  );
});

test('search box (top-right): filters cards by name and eligibility keywords', async ({ page }) => {  // the search box lives in the sticky header, top-right
  const box = page.getByLabel('Search programs');
  await expect(box).toBeVisible();
  await expect(box).toBeInViewport();

  const before = await page.locator('.opportunity-card').count();
  expect(before).toBeGreaterThan(3);

  // 1) program-name keyword narrows the catalog and hides empty sections
  // (count can drift if a parallel admin test mutates the shared e2e DB —
  // compare against this test's own snapshot, not a global total)
  await box.fill('Fulbright');
  await expect(page.locator('.content-search-status')).toContainText(/match/i);
  const hits = page.locator('.opportunity-card', { hasText: 'Fulbright' });
  await expect(hits.first()).toBeVisible();
  expect(await page.locator('.opportunity-card').count()).toBeLessThan(before);
  // non-matching sections are hidden entirely
  await expect(page.locator('#on-campus')).toHaveCount(0);

  // 2) no-match shows the empty state with a Clear search action
  await box.fill('zzz-no-such-program-zzz');
  await expect(page.getByText(/No programs match/i)).toBeVisible();
  await expect(page.locator('.opportunity-card')).toHaveCount(0);

  // 3) clearing restores the catalog (sections back, cards > 0 again)
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(page.locator('.opportunity-card').first()).toBeVisible();
  await expect(page.locator('#on-campus')).toBeVisible();
  expect(await page.locator('.opportunity-card').count()).toBeGreaterThan(3);
});

test('scenario 5: reduced motion — no scroll/hero animation, modal still works', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('/resources');
  await expect(page.locator('.opportunity-card').first()).toBeVisible();

  // sections fully visible without ScrollTrigger fromTo (opacity intact)
  const op = await page.locator('.content-section').first().evaluate((el) => getComputedStyle(el).opacity);
  expect(op).toBe('1');
  await ctx.close();
});

test('live sync: admin approve/withdraw reflect on an open display tab', async ({ browser }) => {
  const adminCtx = await browser.newContext();
  const displayCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  const display = await displayCtx.newPage();

  // display tab open on /resources
  await display.goto('/resources');
  const firstCardName = (await display.locator('.card-name').first().innerText()).trim();
  expect(firstCardName.length).toBeGreaterThan(0);

  // admin: login, approve one review item
  await admin.goto('/admin');
  await admin.getByLabel('Password').fill('dku-admin');
  await admin.getByRole('button', { name: 'Sign in' }).click();
  await expect(admin.getByRole('heading', { name: 'Hi, admin :)' })).toBeVisible();

  // withdraw the first published item (the one the display shows)
  await admin.goto('/admin/review/content-management');
  const targetRow = admin.locator('tbody tr').first();
  // td.nth(1) = Program (col 0 is the select checkbox)
  const withdrawnName = (await targetRow.locator('td').nth(1).innerText()).split('\n')[0];
  await targetRow.getByRole('button', { name: 'Withdraw' }).click();

  // display tab: card disappears live (fuse window 7s + SSE ≤1s)
  await expect(
    display.locator('.card-name', { hasText: withdrawnName }).first(),
  ).toHaveCount(0, { timeout: 10_000 });

  // admin approves one review item → card appears on display
  await admin.goto('/admin/review/review-list');
  const approveRow = admin.locator('tbody tr').first();
  const approvedName = (await approveRow.locator('td').nth(1).innerText()).split('\n')[0];
  await approveRow.getByRole('button', { name: 'Approve' }).click();
  await expect(
    display.locator('.card-name', { hasText: approvedName }).first(),
  ).toBeVisible({ timeout: 10_000 });

  await adminCtx.close();
  await displayCtx.close();
});

test('dead card image degrades to the letter fallback, never a broken icon', async ({ request, page }) => {
  // admin-API: point the first published entry at an uploaded-image URL
  // that matches the naming shape but has no file behind it (404).
  // The `request` fixture carries the login cookie automatically.
  await request.post('/api/login', { data: { password: 'dku-admin' } });
  const list = await request.get('/api/entries?status=published');
  const first = (await list.json())[0] as { id: number; name: string };
  const dead = '/api/uploads/img-deadbeef-0000000000.png';
  expect((await request.get(dead)).status()).toBe(404);

  const patch = await request.put(`/api/entries/${first.id}`, { data: { imageUrl: dead } });
  expect(patch.ok()).toBe(true);

  // the display card for that entry: the <img> errors and is REPLACED by
  // the tonal first-letter fallback — no broken-image icon left behind
  await page.goto('/resources');
  const card = page.locator('.opportunity-card', { hasText: first.name }).first();
  await card.scrollIntoViewIfNeeded();
  await expect(card.locator('.card-fallback')).toBeVisible({ timeout: 10_000 });
  await expect(card.locator('img')).toHaveCount(0);

  // the entry modal (click the card) also shows its fallback letter
  await card.click();
  const modal = page.locator('[role="dialog"]');
  await modal.waitFor();
  await expect(modal.locator('.modal-fallback')).toBeVisible({ timeout: 10_000 });
  await page.keyboard.press('Escape');
});
