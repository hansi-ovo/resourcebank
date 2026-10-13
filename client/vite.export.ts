import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'node:path';

/**
 * Single-file export build: everything (JS, CSS, fonts, static art) inlined
 * into one portable index.html that also works when opened via file://.
 *
 * Content comes from the embedded demo snapshot (client/src/lib/
 * demoSnapshot.ts) whenever /api is unreachable — see ContentPage.load().
 * Regenerate the snapshot with: node scripts/make-demo-snapshot.mjs
 *
 * Usage: npm run build:export -w client  →  client/dist-export/index.html
 */
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    viteSingleFile({ removeViteModuleLoader: true }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist-export',
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 100_000,
  },
});
