import { chromium } from '@playwright/test';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';

const url = process.argv[2] ?? 'http://localhost:4173/resources';
const chrome = await chromeLauncher.launch({
  chromePath: chromium.executablePath(),
  port: 9224,
  chromeFlags: ['--headless'],
});
try {
  const r = await lighthouse(url, {
    port: chrome.port,
    output: 'json',
    formFactor: 'desktop',
    screenEmulation: { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false },
  });
  const keys = [
    'first-contentful-paint',
    'largest-contentful-paint',
    'total-blocking-time',
    'cumulative-layout-shift',
    'speed-index',
    'interactive',
  ];
  for (const k of keys) {
    const a = r.lhr.audits[k];
    if (a) console.log(`${k}: ${a.displayValue ?? Math.round(a.numericValue ?? 0)}ms (score ${a.score ?? '-'})`);
  }
  const netItems = r.lhr.audits['network-requests'].details?.items ?? [];
  console.log('requests:', netItems.length, 'total transferred:', Math.round(netItems.reduce((s, i) => s + (i.transferSize ?? 0), 0) / 1024) + 'KB');
  const mainThread = r.lhr.audits['mainthread-work-breakdown'].details?.items ?? [];
  for (const m of mainThread.slice(0, 4)) console.log('mainthread:', m.groupLabel ?? m.group, Math.round(m.duration) + 'ms');
} finally {
  try {
    await chrome.kill();
  } catch {}
}
