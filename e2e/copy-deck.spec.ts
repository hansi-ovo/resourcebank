import { test, expect } from '@playwright/test';

/**
 * Phase 5 — copy deck diff pass (03-pages-spec.md §Copy deck, verbatim).
 * ⚑ items are asserted too (they are client-tunable, flagged in questions.md).
 */

test('admin copy deck verbatim', async ({ page }) => {
  await page.goto('/admin');

  // login card
  await expect(page.getByRole('heading', { name: 'Admin sign-in' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel('Password')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await page.getByLabel('Password').fill('nope');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Wrong password. Try again.')).toBeVisible();

  await page.getByLabel('Password').fill('dku-admin');
  await page.getByRole('button', { name: 'Sign in' }).click();

  // home
  await expect(page.getByRole('heading', { name: 'Hi, admin :)' })).toBeVisible();
  await expect(page.getByText('Search the web for programs')).toBeVisible();
  await expect(
    page.getByPlaceholder('Describe what to look for, e.g. leadership fellowships for undergraduates in Asia'),
  ).toBeVisible(); // ⚑
  await expect(page.getByRole('radio', { name: 'All' })).toBeVisible();
  for (const label of [
    'On-Campus Opportunities',
    'Fellowships',
    'Experiential Programs',
    'Event & Conference',
    'Training Programs',
  ]) {
    await expect(page.getByRole('radio', { name: label })).toBeVisible();
  }
  await expect(page.getByText(/items to review, \d+ sites with unchecked updates/)).toBeVisible(); // ⚑
  await expect(page.getByRole('link', { name: 'Go to review' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View site' })).toBeVisible();

  // review page tabs + back (nav labels carry live count badges, so match by prefix text)
  await page.getByRole('link', { name: 'Go to review' }).click();
  await expect(page.getByRole('link', { name: 'Admin home' })).toBeVisible();
  await expect(page.locator('nav[aria-label="Review sections"]').getByText('Review list')).toBeVisible();
  await expect(page.locator('nav[aria-label="Review sections"]').getByText('Check updates')).toBeVisible();
  await expect(page.locator('nav[aria-label="Review sections"]').getByText('Content management')).toBeVisible();

  // check updates tab: empty state OR pending diff cards (earlier e2e runs may
  // have injected demo diffs into the shared DB); demo button always present
  await page.getByRole('link', { name: 'Check updates' }).click();
  await expect(page.getByRole('button', { name: 'Run demo check' })).toBeVisible();
  await expect
    .poll(
      async () =>
        (await page.getByText('No changes detected. Checks run every Monday.').count()) > 0 ||
        (await page.getByText(/^Detected /).count()) > 0,
      { timeout: 8_000 },
    )
    .toBe(true);

  // content management footer note ⚑
  await page.getByRole('link', { name: 'Content management' }).click();
  await expect(
    page.getByText('Published programs appear on the public site immediately.'),
  ).toBeVisible();
});

test('display copy deck verbatim', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: 'DKU Leadership Resource Bank' }),
  ).toBeVisible();
  await expect(page.getByText('Discover Opportunities Beyond the Classroom')).toBeVisible();
  await expect(
    page.getByText(/Leadership development does not happen in a single program/),
  ).toBeVisible();
  await expect(
    page.getByText(/curated by DKU Leadership Programs to help students discover/),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Get started!' })).toBeVisible();

  await page.goto('/resources');
  await expect(page.locator('.opportunity-card').first()).toBeVisible();

  // five section labels, sentence case
  for (const label of [
    'On-Campus Opportunities',
    'Fellowships',
    'Experiential Programs',
    'Event & Conference',
    'Training Programs',
  ]) {
    await expect(page.getByRole('heading', { name: label })).toBeVisible();
  }

  // modal copy
  await page.locator('.opportunity-card').first().click();
  await expect(page.getByRole('link', { name: 'Visit website' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close' })).toBeVisible();
});
