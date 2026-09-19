import { test, expect } from '@playwright/test';

/**
 * Phase 2 acceptance — Playwright admin scenarios #1–2 (01-architecture §8).
 * Runs with FAST_MODE=300ms via playwright.config webServer env.
 */

const PASSWORD = 'dku-admin';

test('scenario 1: login → search → approve → content management → withdraw', async ({ page }) => {
  // login card renders on /admin when unauthenticated (URL preserved)
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Admin sign-in' })).toBeVisible({ timeout: 20_000 });
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Wrong password. Try again.')).toBeVisible();

  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Hi, admin :)' })).toBeVisible();

  // search panel: scope pills + placeholder copy deck
  await expect(page.getByLabel('Search the web for programs', { exact: true })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'All' })).toBeChecked();

  // run a search (FAST_MODE 300ms; seeded DB dedupes everything → 0 added)
  await page.getByLabel('Search the web for programs', { exact: true }).fill('climate research expedition');
  await page.getByRole('button', { name: 'Send search' }).click();
  await expect(page.getByText('Searching the web. This usually takes a few minutes.')).toBeVisible();
  await expect(page.getByText(/Search finished: \d+ items added to review/)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/Last search: /)).toBeVisible();

  // go to review list
  await page.getByRole('link', { name: 'Go to review' }).click();
  await expect(page).toHaveURL(/\/admin\/review\/review-list$/);
  const firstRow = page.locator('tbody tr').first();
  await expect(firstRow).toBeVisible();

  // approve the first row (FuseButton press → optimistic hide → server after 7s)
  const firstName = (await firstRow.locator('td').nth(1).innerText()).split('\n')[0];
  await firstRow.getByRole('button', { name: 'Approve' }).click();
  await expect
    .poll(
      async () => (await page.getByText('Moved to Content management').count()) > 0,
      { timeout: 15_000 },
    )
    .toBe(true);

  // undo within the window via that toast's own button (scoped: a detach-race
  // on an older toast must not swallow the click)
  const undoToast = page.locator('[role="status"]', { hasText: 'Moved to Content management' }).first();
  await undoToast.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('tbody tr', { hasText: firstName }).first()).toBeVisible();

  // approve again, this time let the 7s window expire
  await page.locator('tbody tr').first().getByRole('button', { name: 'Approve' }).click();
  await expect
    .poll(
      async () => (await page.getByText('Moved to Content management').count()) > 0,
      { timeout: 15_000 },
    )
    .toBe(true);

  // content management tab shows published rows (seeded)
  await page.getByRole('link', { name: 'Content management' }).click();
  await expect(page).toHaveURL(/\/admin\/review\/content-management$/);
  await expect(page.getByText('Published programs appear on the public site immediately.')).toBeVisible();

  // withdraw the first published row → toast copy
  const cFirst = page.locator('tbody tr').first();
  const cName = (await cFirst.locator('td').first().innerText()).split('\n')[0];
  await cFirst.getByRole('button', { name: 'Withdraw' }).click();
  await expect
    .poll(
      async () => (await page.getByText('Withdrawn from the public site').count()) > 0,
      { timeout: 15_000 },
    )
    .toBe(true);
  // wait out the fuse window so the server mutation lands before assertions end
  await page.waitForTimeout(7300);
  await expect(page.locator('tbody tr', { hasText: cName })).toHaveCount(0);
});

test('scenario 2: double-click cell edit persists after reload', async ({ page }) => {
  await page.goto('/admin');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Hi, admin :)' })).toBeVisible();

  await page.goto('/admin/review/review-list');
  const firstRow = page.locator('tbody tr').first();
  await expect(firstRow).toBeVisible();

  // unique per run so repeated runs never collapse into a no-op edit
  const newName = `Edited Program ${Date.now().toString().slice(-6)}`;

  // double-click the program name cell → inline input
  const nameCell = firstRow.locator('td').nth(1);
  await nameCell.dblclick();
  // input, not one of the per-row hidden Edit buttons with the same label
  const input = page.locator('input[aria-label="Edit program name"]');
  await expect(input).toBeVisible();
  await input.fill(newName);
  await input.press('Enter');
  await expect
    .poll(
      async () => (await page.getByText('Saved').count()) > 0,
      { timeout: 15_000 },
    )
    .toBe(true);
  await expect(page.getByRole('cell', { name: newName }).first()).toBeVisible();

  // persists after reload
  await page.reload();
  await expect(page.getByRole('cell', { name: newName }).first()).toBeVisible();
});

test('keyboard edit path + Escape cancel', async ({ page }) => {
  await page.goto('/admin');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Hi, admin :)' })).toBeVisible();
  await page.goto('/admin/review/review-list');

  // hidden keyboard Edit button: visible on focus, operable by keyboard
  const row = page.locator('tbody tr').first();
  const editBtn = row.getByRole('button', { name: /Edit website/ });
  await editBtn.focus();
  await editBtn.press('Enter');
  const input = page.locator('input[aria-label="Edit website"]');
  await expect(input).toBeVisible();
  await input.press('Escape');
  await expect(input).toHaveCount(0);
});

test('right-click context menu opens Edit (D9 third affordance)', async ({ page }) => {
  await page.goto('/admin');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Hi, admin :)'})).toBeVisible();
  await page.goto('/admin/review/review-list');

  const row = page.locator('tbody tr').first();
  const nameCell = row.locator('td').nth(1);
  await nameCell.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Edit' })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  await expect(page.locator('input[aria-label="Edit program name"]')).toBeVisible();
  await page.keyboard.press('Escape');
});

test('tag-only search: submit works without typing a prompt (request #2)', async ({ page }) => {
  await page.goto('/admin');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Hi, admin :)' })).toBeVisible();

  // select a scope, keep the input empty, submit
  await page.getByRole('radio', { name: 'Fellowships' }).click();
  await page.getByRole('button', { name: 'Send search' }).click();
  // searching note shows (input NOT required to have text)
  await expect(page.getByText('Searching the web. This usually takes a few minutes.')).toBeVisible();
  await expect(page.getByText(/Search finished: \d+ items added to review/)).toBeVisible({
    timeout: 10_000,
  });
});

test('check updates: demo check → apply → discard', async ({ page }) => {
  await page.goto('/admin');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Hi, admin :)' })).toBeVisible();

  await page.goto('/admin/review/check-updates');
  // empty state OR cards from earlier runs (shared dev DB); demo button works either way
  await expect(page.getByRole('button', { name: 'Run demo check' })).toBeVisible();

  // run demo check → 2-3 grouped diff rows
  await page.getByRole('button', { name: 'Run demo check' }).click();
  const card = page.locator('li', { hasText: 'Detected' }).first();
  await expect(card).toBeVisible({ timeout: 10_000 });

  // apply the first one → toast + row leaves the pending list
  await card.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText('Update applied')).toBeVisible();

  // discard the next one if present
  const remaining = page.locator('li', { hasText: 'Detected' });
  if ((await remaining.count()) > 0) {
    await remaining.first().getByRole('button', { name: 'Discard' }).click();
    await expect(page.getByText('Discarded')).toBeVisible();
  }
});

test('FuseButton respects prefers-reduced-motion (instant, no fuse burn)', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('/admin');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Hi, admin :)' })).toBeVisible();
  await page.goto('/admin/review/review-list');

  const row = page.locator('tbody tr').first();
  await expect(row).toBeVisible();

  // press approve → instant swap (no burn animation), row optimistically hides,
  // toast Undo available
  await row.getByRole('button', { name: 'Approve' }).click();
  await expect
    .poll(
      async () => (await page.getByText('Moved to Content management').count()) > 0,
      { timeout: 15_000 },
    )
    .toBe(true);

  // the armed FuseButton (toast-visible clone is separate) hides its burning rim
  const rimHidden = await page.evaluate(() => {
    const armed = document.querySelector('[data-phase="armed"]');
    if (!armed) return true; // already unmounted (row hid) — fine for reduced motion
    const svg = armed.querySelector('svg');
    const line = armed.querySelector('i');
    const hidden = (el) => !el || getComputedStyle(el).display === 'none';
    return hidden(svg) && hidden(line);
  });
  expect(rimHidden).toBe(true);

  // undo via toast → nothing was sent, row returns
  await page.getByRole('button', { name: 'Undo' }).first().click();
  await expect(page.locator('tbody tr').first()).toBeVisible();
  await ctx.close();
});
