/**
 * Generates the seed placeholder art as static files (client/public/seed/*.svg).
 * These ship with the client build; the display app maps entry.imageUrl values
 * (`/api/seedimg/:cat/:file`) onto the static copies at render time.
 * Regenerate with: node scripts/generate-seed-art.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const C = {
  'on-campus': '#3E7A5C',
  fellowships: '#33605B',
  experiential: '#336472',
  events: '#3F5F85',
  training: '#465891',
};

const LABELS = {
  'on-campus': 'On-Campus Opportunities',
  fellowships: 'Fellowships',
  experiential: 'Experiential Programs',
  events: 'Event &amp; Conference',
  training: 'Training Programs',
};

const outDir = path.resolve(__dirname, '../client/public/seed');
fs.mkdirSync(outDir, { recursive: true });

for (const [cat, color] of Object.entries(C)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
  <rect width="960" height="540" fill="url(#g)"/>
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${color}" stop-opacity="0.92"/>
      <stop offset="1" stop-color="${color}" stop-opacity="0.68"/>
    </linearGradient>
  </defs>
  <circle cx="820" cy="80" r="180" fill="#ffffff" fill-opacity="0.07"/>
  <circle cx="120" cy="470" r="240" fill="#ffffff" fill-opacity="0.05"/>
  <text x="48" y="492" font-family="Georgia, 'Times New Roman', serif" font-size="200" font-weight="200" fill="#ffffff" fill-opacity="0.22">${LABELS[cat].slice(0, 1)}</text>
  <text x="48" y="96" font-family="'Segoe UI', Arial, sans-serif" font-size="28" font-weight="500" fill="#ffffff" fill-opacity="0.85">DKU Leadership Resource Bank</text>
  <text x="48" y="130" font-family="'Segoe UI', Arial, sans-serif" font-size="17" fill="#ffffff" fill-opacity="0.6">${LABELS[cat]}</text>
</svg>
`;
  fs.writeFileSync(path.join(outDir, `${cat}.svg`), svg);
  console.log('wrote', cat + '.svg');
}
