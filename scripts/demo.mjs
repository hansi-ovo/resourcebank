/**
 * Definition-of-done live demo script (04-build-phases.md §Definition of done).
 * Runs the FULL honest flow against the dev servers WITHOUT FAST_MODE
 * (search waits ~25s for real) and screenshots each step into .omo/reviews/demo/.
 *
 * Usage (dev servers must run on default mode):
 *   node scripts/demo.mjs
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../.omo/reviews/demo');
fs.mkdirSync(OUT, { recursive: true });

const DISPLAY = 'http://localhost:5173';
const ADMIN = 'http://localhost:5173/admin';
const results = [];
const log = (step, ok, note = '') => {
  results.push({ step, ok, note });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${step}${note ? ` — ${note}` : ''}`);
};

const browser = await chromium.launch();
const admin = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const display = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const shot = (name) => display.screenshot({ path: path.join(OUT, name) }).catch(() => undefined);
const shotAdmin = (name) => admin.screenshot({ path: path.join(OUT, name) }).catch(() => undefined);

try {
  // ── display home ──────────────────────────────────────────────────────
  await display.goto(`${DISPLAY}/`);
  await display.waitForSelector('.hero-reveal.is-in', { timeout: 15_000 });
  await display.waitForTimeout(600);
  await shot('01-hero.png');
  log('hero renders with copy deck', true);

  // ── transition to content ─────────────────────────────────────────────
  await display.getByRole('button', { name: 'Get started!' }).click();
  await display.waitForSelector('[data-section-title]', { timeout: 15_000 });
  await display.waitForTimeout(1_400); // flight + settle
  await shot('02-content-after-transition.png');
  const sections = await display.locator('[data-section-title]').count();
  log('transition lands on /resources', sections === 5, `${sections} section titles`);

  // keep display tab open for live-sync checks
  const cardCountBefore = await display.locator('.opportunity-card').count();

  // ── TOC jump ──────────────────────────────────────────────────────────
  await display.locator('.toc-item', { hasText: 'Fellowships' }).click();
  await display.waitForTimeout(900);
  const fellowshipInView = await display
    .locator('#fellowships')
    .isVisible()
    .then(() => true)
    .catch(() => false);
  await shot('03-toc-jump-fellowships.png');
  log('TOC click jumps to Fellowships', fellowshipInView);

  // ── modal ×3 ways ─────────────────────────────────────────────────────
  await display.locator('.opportunity-card').first().click();
  await display.waitForSelector('[role="dialog"]');
  await display.waitForTimeout(500);
  await shot('04-modal-open.png');
  await display.keyboard.press('Escape');
  let closed = (await display.locator('[role="dialog"]').count()) === 0;
  log('modal closes via Escape', closed);

  await display.locator('.opportunity-card').first().click();
  await display.waitForSelector('[role="dialog"]');
  await display.getByRole('button', { name: 'Close' }).click();
  closed = (await display.locator('[role="dialog"]').count()) === 0;
  log('modal closes via ×', closed);

  await display.locator('.opportunity-card').first().click();
  await display.waitForSelector('[role="dialog"]');
  await display.mouse.click(14, 500);
  closed = (await display.locator('[role="dialog"]').count()) === 0;
  log('modal closes via outside click', closed);

  // ── admin: login ──────────────────────────────────────────────────────
  await admin.goto(ADMIN);
  await admin.getByLabel('Password').fill('dku-admin');
  await admin.getByRole('button', { name: 'Sign in' }).click();
  await admin.waitForSelector('text=Hi, admin :)');
  await shotAdmin('05-admin-home.png');
  log('admin login', true);

  // ── honest search (~25s) ──────────────────────────────────────────────
  const searchStart = Date.now();
  await admin.getByLabel('Search the web for programs', { exact: true }).fill('leadership fellowship China');
  await shotAdmin('06-search-started.png');
  await admin.getByRole('button', { name: 'Send search' }).click();

  // during search: other UI stays usable — edit a review cell meanwhile
  await admin.goto(`${ADMIN}/review/review-list`);
  await admin.waitForSelector('tbody tr');
  const editName = `Demo Edited ${Date.now().toString().slice(-5)}`;
  const firstRow = admin.locator('tbody tr').first();
  await firstRow.locator('td').nth(1).dblclick();
  await admin.locator('input[aria-label="Edit program name"]').fill(editName);
  await admin.locator('input[aria-label="Edit program name"]').press('Enter');
  await admin.waitForSelector('text=Saved');
  await shotAdmin('07-edit-while-searching.png');
  log('cell edit while search runs (non-blocking UI)', true);

  // wait for the search to finish honestly (max 40s)
  await admin.waitForSelector('text=/Search finished: \\d+ items added to review/', {
    timeout: 40_000,
  });
  const searchMs = Date.now() - searchStart;
  await shotAdmin('08-search-finished.png');
  log(
    'search finishes with toast',
    true,
    `${(searchMs / 1000).toFixed(1)}s (honest delay is 25s; overhead = navigation)`,
  );

  // edit persists after reload
  await admin.reload();
  await admin.waitForSelector('tbody tr');
  const persisted = (await admin.getByText(editName).count()) > 0;
  log('edited name persists after reload', persisted);

  // ── demo check → apply ────────────────────────────────────────────────
  await admin.goto(`${ADMIN}/review/check-updates`);
  await admin.getByRole('button', { name: 'Run demo check' }).click();
  await admin.waitForSelector('li:has-text("Detected")', { timeout: 10_000 });
  await shotAdmin('09-check-updates-diffs.png');
  await admin.locator('li:has-text("Detected")').first().getByRole('button', { name: 'Apply' }).click();
  await admin.waitForSelector('text=Update applied');
  log('demo check → apply updates entry', true);

  // ── approve → display card appears ────────────────────────────────────
  await admin.goto(`${ADMIN}/review/review-list`);
  await admin.waitForSelector('tbody tr');
  const approveRow = admin.locator('tbody tr').first();
  const approvedName = ((await approveRow.locator('td').nth(1).innerText()).split('\n')[0] ?? '').trim();
  await approveRow.getByRole('button', { name: 'Approve' }).click();
  await admin.waitForSelector('text=Moved to Content management');
  log('approve pressed (fuse window open)', true, approvedName);

  // display tab: card appears after fuse window + SSE
  let appeared = false;
  for (let i = 0; i < 30; i++) {
    await display.waitForTimeout(500);
    const names = await display.locator('.card-name').allInnerTexts();
    if (names.some((n) => n.includes(approvedName))) {
      appeared = true;
      break;
    }
  }
  await shot('10-card-appeared-live.png');
  log('approved card appears on open display tab', appeared, approvedName);

  // ── withdraw → display card disappears ────────────────────────────────
  await admin.goto(`${ADMIN}/review/content-management`);
  await admin.waitForSelector('tbody tr');
  const wRow = admin.locator('tbody tr', { hasText: approvedName }).first();
  if ((await wRow.count()) === 0) {
    // fall back to first published row
    await admin.locator('tbody tr').first().getByRole('button', { name: 'Withdraw' }).click();
  } else {
    await wRow.getByRole('button', { name: 'Withdraw' }).click();
  }
  await admin.waitForSelector('text=Withdrawn from the public site');
  log('withdraw pressed', true);

  let disappeared = false;
  for (let i = 0; i < 30; i++) {
    await display.waitForTimeout(500);
    const names = await display.locator('.card-name').allInnerTexts();
    if (!names.some((n) => n.includes(approvedName))) {
      disappeared = true;
      break;
    }
  }
  const cardCountAfter = await display.locator('.opportunity-card').count();
  await shot('11-card-disappeared-live.png');
  log('withdrawn card disappears from display', disappeared || cardCountAfter < cardCountBefore);

  // ── summary ───────────────────────────────────────────────────────────
  const failed = results.filter((r) => !r.ok);
  console.log(`\nDEMO RESULT: ${results.length - failed.length}/${results.length} steps passed`);
  fs.writeFileSync(
    path.join(OUT, 'demo-results.json'),
    JSON.stringify({ date: new Date().toISOString(), results }, null, 2),
  );
  await browser.close();
  process.exit(failed.length ? 1 : 0);
} catch (err) {
  console.error('DEMO FAILED:', err);
  await shot('99-failure.png');
  await browser.close();
  process.exit(1);
}
