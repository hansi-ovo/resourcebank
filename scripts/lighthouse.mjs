/**
 * Lighthouse runner (Phase 4/5 acceptance: a11y >= 95 on both apps,
 * perf >= 90 on display). Uses the local Chromium bundled with Playwright.
 *
 * Usage: node scripts/lighthouse.mjs
 */
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';

const PAGES = [
  { name: 'hero', url: 'http://localhost:5173/' },
  { name: 'content', url: 'http://localhost:5173/resources' },
  { name: 'admin-login', url: 'http://localhost:5173/admin' },
];

function launchChrome() {
  const exe = chromium.executablePath();
  return chromeLauncher.launch({ chromePath: exe, port: 9222, chromeFlags: ['--headless'] });
}

const results = [];
const chrome = await launchChrome();
try {
  for (const p of PAGES) {
    const runnerResult = await lighthouse(p.url, {
      port: chrome.port,
      output: 'json',
      onlyCategories: ['accessibility', 'performance'],
      formFactor: 'desktop',
      screenEmulation: {
        mobile: false,
        width: 1350,
        height: 940,
        deviceScaleFactor: 1,
        disabled: false,
      },
    });
    const { categories } = runnerResult.lhr;
    results.push({
      page: p.name,
      a11y: Math.round(categories.accessibility.score * 100),
      perf: Math.round(categories.performance.score * 100),
    });
  }
} finally {
  try {
    await chrome.kill();
  } catch {
    /* Windows temp-dir cleanup race — harmless */
  }
}

let ok = true;
for (const r of results) {
  console.log(`${r.page}: a11y=${r.a11y} perf=${r.perf}`);
  if (r.a11y < 95) ok = false;
}
if (results.find((r) => r.page === 'content').perf < 90) ok = false;
process.exit(ok ? 0 : 1);
