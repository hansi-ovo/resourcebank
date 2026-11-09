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
  // td.nth(1) = Program (col 0 is the select checkbox)
  const cName = (await cFirst.locator('td').nth(1).innerText()).split('\n')[0];
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

test('manual add: home button → left nav → form → lands in content management', async ({ page }) => {
  await page.goto('/admin');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Hi, admin :)' })).toBeVisible();

  // home button routes into the manual-add tab
  await page.getByRole('link', { name: 'Add manually' }).click();
  await expect(page).toHaveURL(/\/admin\/review\/manual-add$/);

  // left nav carries the manual-add item (the only one on this page)
  await expect(page.getByRole('link', { name: 'Add manually' })).toBeVisible();

  // fill the form (fields mirror the review table header)
  const url = `https://example.edu/manual-${Date.now()}`;
  await page.getByLabel(/Program/).fill('Manually Added Fellowship');
  await page.getByRole('radio', { name: 'Fellowships' }).click();
  await page.getByLabel('Web link').fill(url);
  await page.getByLabel('Add eligibility tag').fill('Undergraduates');
  await page.getByLabel('Add eligibility tag').press('Enter');
  await page.getByLabel(/^Overview/).fill('A program the admin typed in by hand during an e2e run, with enough text.');

  await page.getByRole('button', { name: 'Add to Content management' }).click();

  // toast + redirect into content management, where the row is live
  await expect(page.getByText('Added to Content management')).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/admin\/review\/content-management$/);
  await expect(page.locator('tbody tr', { hasText: 'Manually Added Fellowship' }).first()).toBeVisible();

  // it is live on the public payload too (manual = published)
  const pub = await page.request.get('/api/published');
  const sections = (await pub.json()) as Array<{ category: { id: string }; entries: { url: string }[] }>;
  expect(
    sections
      .find((s) => s.category.id === 'fellowships')!
      .entries.some((e) => e.url === url),
  ).toBe(true);
});

test('eligibility edit: Enter alone saves — no separate Save click needed', async ({ page }) => {
  await page.goto('/admin');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Hi, admin :)' })).toBeVisible();
  await page.goto('/admin/review/review-list');

  const row = page.locator('tbody tr').first();
  await expect(row).toBeVisible();

  // open the eligibility (audience) editor via the hidden keyboard Edit button
  const editBtn = row.getByRole('button', { name: /Edit audience/ });
  await editBtn.focus();
  await editBtn.press('Enter');
  const tagInput = page.getByLabel('Add audience tag');
  await expect(tagInput).toBeVisible();

  // type a unique tag and press ONLY Enter — that press saves everything
  const tag = `Enter-Saved ${Date.now().toString().slice(-5)}`;
  await tagInput.fill(tag);
  await tagInput.press('Enter');
  await expect
    .poll(async () => (await page.getByText('Saved').count()) > 0, { timeout: 15_000 })
    .toBe(true);

  // persisted after reload
  await page.reload();
  await expect(page.locator('tbody tr').first()).toBeVisible();
  await expect(
    page.locator('.review-table-scroll span', { hasText: tag }).first(),
  ).toBeVisible();

  // second path: Save BUTTON on a staged draft saves too (Enter-free)
  const row2 = page.locator('tbody tr').first();
  await row2.getByRole('button', { name: /Edit audience/ }).focus();
  await page.keyboard.press('Enter');
  const tagInput2 = page.getByLabel('Add audience tag');
  await expect(tagInput2).toBeVisible();
  const tag2 = `Click-Saved ${Date.now().toString().slice(-5)}`;
  await tagInput2.fill(tag2);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect
    .poll(async () => (await page.locator('.review-table-scroll span', { hasText: tag2 }).count()) > 0, {
      timeout: 15_000,
    })
    .toBe(true);
  await page.reload();
  await expect(
    page.locator('.review-table-scroll span', { hasText: tag2 }).first(),
  ).toBeVisible();
});

test('review list: Export selected downloads a CSV of the checked rows', async ({ page }) => {
  await page.goto('/admin');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Hi, admin :)' })).toBeVisible();
  await page.goto('/admin/review/review-list');

  const row = page.locator('tbody tr').first();
  await expect(row).toBeVisible();
  const programName = (await row.locator('td').nth(1).innerText()).split('\n')[0];

  // check the first row → selection bar shows Export selected
  await row.getByRole('checkbox').check();
  await expect(page.getByText('1 selected')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /export/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^review-list-\d{4}-\d{2}-\d{2}\.csv$/);

  // CSV content carries the selected program row
  const path = await download.path();
  const { readFileSync } = await import('node:fs');
  const content = readFileSync(path, 'utf8');
  expect(content.startsWith('\uFEFF')).toBe(true); // UTF-8 BOM for Excel
  expect(content).toContain('Programs,Web Links,Overview,Category,Eligibility,Application Timeline');
  expect(content).toContain(programName);
});

test('content management: checkboxes + export the checked published rows', async ({ page }) => {
  await page.goto('/admin');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Hi, admin :)' })).toBeVisible();
  await page.goto('/admin/review/content-management');

  const row = page.locator('tbody tr').first();
  await expect(row).toBeVisible();

  await row.getByRole('checkbox').check();
  await expect(page.getByText('1 selected')).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /export/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^content-management-\d{4}-\d{2}-\d{2}\.csv$/);
});

test('manual add: recognize box (offline e2e) shows the graceful unavailable error', async ({ page }) => {
  await page.goto('/admin');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Hi, admin :)' })).toBeVisible();
  await page.goto('/admin/review/manual-add');

  // the recognition box sits above the form
  const box = page.getByLabel('Recognize from a web page');
  await expect(box).toBeVisible();
  // the Recognize button stays disabled until a URL is typed
  const btn = page.getByRole('button', { name: 'Recognize' });
  await expect(btn).toBeDisabled();
  await box.fill('https://example.org/program');
  await expect(btn).toBeEnabled();

  // e2e runs with the LLM gateway blanked → the 503 path shows a readable toast
  await btn.click();
  await expect(page.getByText(/Auto-recognition is unavailable/i)).toBeVisible({ timeout: 10_000 });
});

test('image upload: manual add — upload a local JPG/PNG and ship it with the entry', async ({ page }) => {
  await page.goto('/admin');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Hi, admin :)' })).toBeVisible();
  await page.goto('/admin/review/manual-add');

  // a real 1x1 PNG via buffer — no fixture files on disk
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  );
  await page.getByLabel('Upload an image file').setInputFiles({ name: 'qa-card.png', mimeType: 'image/png', buffer: png });

  // upload fills the Image URL field with the servable path + toast
  await expect(page.getByText('Image uploaded')).toBeVisible({ timeout: 10_000 });
  const uploadedUrl = await page.locator('#manual-image').inputValue();
  expect(uploadedUrl).toMatch(/^\/api\/uploads\/img-[a-z0-9]+-[a-f0-9]+\.png$/);

  // the image is already served by the API
  const img = await page.request.get(uploadedUrl);
  expect(img.status()).toBe(200);
  expect(img.headers()['content-type']).toMatch(/image\/png/);

  // finish the form and submit — entry keeps the uploaded path
  const url = `https://example.edu/upload-${Date.now()}`;
  await page.getByLabel(/Program/).fill('Uploaded Image Fellowship');
  await page.getByRole('radio', { name: 'Fellowships' }).click();
  await page.getByLabel('Web link').fill(url);
  await page.getByLabel(/^Overview/).fill('A manual entry created with a locally uploaded card image during an e2e run.');
  await page.getByRole('button', { name: 'Add to Content management' }).click();
  await expect(page.getByText('Added to Content management')).toBeVisible({ timeout: 15_000 });

  // the row in content management shows the uploaded path and it persists
  const row = page.locator('tbody tr', { hasText: 'Uploaded Image Fellowship' }).first();
  await expect(row).toBeVisible();
  await expect(row.getByText('/api/uploads/img-')).toBeVisible();
  await page.reload();
  await expect(
    page.locator('tbody tr', { hasText: 'Uploaded Image Fellowship' }).first().getByText('/api/uploads/img-'),
  ).toBeVisible();

  // public payload carries it too
  const pub = await page.request.get('/api/published');
  const sections = (await pub.json()) as Array<{ entries: { imageUrl: string | null }[] }>;
  expect(sections.some((s) => s.entries.some((e) => e.imageUrl === uploadedUrl))).toBe(true);
});

test('image upload: review-list inline edit — upload replaces the image and persists', async ({ page }) => {
  await page.goto('/admin');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Hi, admin :)' })).toBeVisible();
  await page.goto('/admin/review/review-list');

  const row = page.locator('tbody tr').first();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /Edit image URL/ }).focus();
  await page.keyboard.press('Enter');
  // role=textbox pins the editor input (each row's Edit button shares the label)
  const editor = page.getByRole('textbox', { name: 'Edit image URL' });
  await expect(editor).toBeVisible();

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  );
  await page.getByLabel('Upload an image file').setInputFiles({ name: 'qa-inline.png', mimeType: 'image/png', buffer: png });

  // upload auto-saves: toast + the cell shows the uploaded path
  await expect
    .poll(async () => (await page.getByText('Saved').count()) > 0, { timeout: 15_000 })
    .toBe(true);
  await expect(page.locator('tbody tr').first().getByText('/api/uploads/img-')).toBeVisible();

  // persists after reload
  await page.reload();
  await expect(page.locator('tbody tr').first().getByText('/api/uploads/img-')).toBeVisible();
});

test('image upload: PNG reported as application/octet-stream (WeChat/ZIP/IM-saved) still uploads', async ({ page }) => {
  await page.goto('/admin');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Hi, admin :)' })).toBeVisible();
  await page.goto('/admin/review/review-list');

  const row = page.locator('tbody tr').first();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /Edit image URL/ }).click();
  await page.getByRole('textbox', { name: 'Edit image URL' }).waitFor();

  // valid PNG bytes, but the browser/OS reports the type as octet-stream —
  // the client must sniff the magic bytes and upload anyway (regression:
  // this exact file used to be rejected with "Unsupported format")
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  );
  await page
    .getByLabel('Upload an image file')
    .setInputFiles({ name: 'wechat-saved.png', mimeType: 'application/octet-stream', buffer: png });

  await expect
    .poll(async () => (await page.getByText('Saved').count()) > 0, { timeout: 15_000 })
    .toBe(true);
  await expect(page.locator('tbody tr').first().getByText('/api/uploads/img-')).toBeVisible();

  // and it persists after reload
  await page.reload();
  await expect(page.locator('tbody tr').first().getByText('/api/uploads/img-')).toBeVisible();
});

test('image upload: a non-image file named .png is rejected with a clear error, nothing saved', async ({ page }) => {
  await page.goto('/admin');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Hi, admin :)' })).toBeVisible();
  await page.goto('/admin/review/review-list');

  const row = page.locator('tbody tr').first();
  await expect(row).toBeVisible();
  // remember THIS row's own image cell (other tests in this file may leave
  // /api/uploads/ URLs on sibling rows — only this row must stay untouched)
  const before = await row.locator('td').nth(7).innerText();
  await row.getByRole('button', { name: /Edit image URL/ }).click();
  await page.getByRole('textbox', { name: 'Edit image URL' }).waitFor();

  await page
    .getByLabel('Upload an image file')
    .setInputFiles({ name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('this is just text, not an image') });

  await expect(page.getByText(/Unsupported format/i)).toBeVisible({ timeout: 10_000 });
  // the editor stays open, and THIS row's image cell is byte-for-byte unchanged
  await expect(page.getByRole('textbox', { name: 'Edit image URL' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect.poll(async () => row.locator('td').nth(7).innerText()).toBe(before);
});

test('image upload: blur while the file chooser is open must NOT save; the picked file still lands', async ({ page }) => {
  await page.goto('/admin');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Hi, admin :)' })).toBeVisible();
  await page.goto('/admin/review/review-list');

  const row = page.locator('tbody tr').first();
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /Edit image URL/ }).click();
  const editor = page.getByRole('textbox', { name: 'Edit image URL' });
  await editor.waitFor();
  const initial = await editor.inputValue();

  // click the REAL Upload button (not setInputFiles): Playwright intercepts
  // the chooser, so it stays "open" until we set files — exactly the window
  // in which Windows Chromium blurs the text input when the native dialog opens.
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.method() + ' ' + r.url()));
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 5_000 }),
    page.getByRole('button', { name: 'Upload' }).click(),
  ]);

  // the stray blur that Windows users hit the moment the dialog opens
  await page.evaluate(() => {
    const el = document.querySelector('input[aria-label="Edit image URL"]') as HTMLInputElement | null;
    el?.blur();
  });
  await page.waitForTimeout(800);

  // NO save happened: no Saved TOAST (precise locator — sibling tests leave
  // "Enter-Saved 123" eligibility chips in this shared-DB table), no PUT,
  // the editor + its value survived
  const savedToast = page.locator('[role="status"]').filter({ hasText: /^Saved$/ });
  expect(await savedToast.count()).toBe(0);
  expect(requests.filter((r) => r.startsWith('PUT'))).toHaveLength(0);
  await expect(editor).toBeVisible();
  await expect(editor).toHaveValue(initial);

  // now the admin picks the file: upload → save → cell replaced
  const png = Buffer.from(
    'iVBORw0KGgoAAAANUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  );
  await chooser.setFiles({ name: 'dialog.png', mimeType: 'image/png', buffer: png });

  await expect
    .poll(async () => (await savedToast.count()) > 0, { timeout: 15_000 })
    .toBe(true);
  await expect(page.locator('tbody tr').first().getByText('/api/uploads/img-')).toBeVisible();
  await page.reload();
  await expect(page.locator('tbody tr').first().getByText('/api/uploads/img-')).toBeVisible();
});
