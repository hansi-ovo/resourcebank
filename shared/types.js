/**
 * Shared domain types — the single source of truth for client + server.
 */
export const CATEGORY_IDS = [
    'on-campus',
    'fellowships',
    'experiential',
    'events',
    'training',
];
/** Canonical category order (display + everywhere). */
export const CATEGORIES = [
    { id: 'on-campus', label: 'On-Campus Opportunities', tint: '#3E7A5C' },
    { id: 'fellowships', label: 'Fellowships', tint: '#33605B' },
    { id: 'experiential', label: 'Experiential Programs', tint: '#336472' },
    { id: 'events', label: 'Event & Conference', tint: '#3F5F85' },
    { id: 'training', label: 'Training Programs', tint: '#465891' },
];
export function categoryMeta(id) {
    const m = CATEGORIES.find((c) => c.id === id);
    if (!m)
        throw new Error(`Unknown category: ${id}`);
    return m;
}
