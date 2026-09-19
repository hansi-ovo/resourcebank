/**
 * Phase 5 — token contrast audit (02-design-system §6).
 * Computes WCAG contrast ratios for the token pairs the design uses.
 * Any ratio below the floor for its role exits non-zero.
 */

function lum(hex) {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255).map((v) =>
    v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a, b) {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** color-mix(in oklab, X t%, Y) approximation for our white/ink mixes. */
function mix(hex, t, base = '#FFFFFF') {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = p(hex);
  const [r2, g2, b2] = p(base);
  const f = t / 100;
  const to = (x) => Math.round(x).toString(16).padStart(2, '0');
  return `#${to(r2 + (r1 - r2) * f)}${to(g2 + (g1 - g2) * f)}${to(b2 + (b1 - b2) * f)}`;
}

const INK = '#1A2B2A';
const CANVAS = '#F7F9F7';
const results = [];
const failures = [];

function check(name, fg, bg, floor) {
  const r = Math.round(ratio(fg, bg) * 100) / 100;
  results.push({ name, fg, bg, ratio: r, floor, pass: r >= floor });
  if (r < floor) failures.push(name);
}

// base pairs
check('ink on canvas', INK, CANVAS, 7); // design claims 12+:1; floor for large-text-ish roles
check('ink on surface', INK, '#FFFFFF', 7);
check('ink-soft on canvas', '#52655F', CANVAS, 4.5);
check('ink-soft on surface', '#52655F', '#FFFFFF', 4.5);

// category colors on white (chip text / section rules context)
const cats = {
  'on-campus': '#3E7A5C',
  fellowships: '#33605B',
  experiential: '#336472',
  events: '#3F5F85',
  training: '#465891',
};
for (const [id, tint] of Object.entries(cats)) {
  check(`cat ${id} on white`, tint, '#FFFFFF', 4.5);
  // chip: 70% cat mixed toward ink, on 10% cat tint background
  const chipText = mix(tint, 70, INK);
  const chipBg = mix(tint, 10, '#FFFFFF');
  check(`chip 70% ${id} on 10% tint`, chipText, chipBg, 4.5);
}

// CTA on ramp mid + hover
check('white on ramp-mid', '#FFFFFF', '#336472', 4.5);
check('white on ramp-mid-deep', '#FFFFFF', '#2B5361', 4.5);

// focus ring on canvas (non-text contrast, floor 3)
check('focus ring on canvas', '#006633', CANVAS, 3);

console.table ? console.table(results) : console.log(results);
if (failures.length) {
  console.error('CONTRAST FAILURES:', failures.join(', '));
  process.exit(1);
}
console.log('All contrast checks pass.');
