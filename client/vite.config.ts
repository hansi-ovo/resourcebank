import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import fs from 'node:fs';

/** After the build, inject font preloads into dist/index.html (hashed URLs). */
function fontPreload(): Plugin {
  return {
    name: 'dku-font-preload',
    apply: 'build',
    closeBundle: {
      sequential: true,
      handler() {
        const dist = path.resolve(__dirname, 'dist');
        const htmlPath = path.join(dist, 'index.html');
        if (!fs.existsSync(htmlPath)) return;
        const fonts = fs
          .readdirSync(path.join(dist, 'assets'))
          .filter(
            (n) =>
              n.endsWith('.woff2') &&
              n.includes('latin') &&
              !n.includes('latin-ext') &&
              !n.includes('vietnamese'),
          );
        const links = fonts
          .map((f) => `<link rel="preload" as="font" type="font/woff2" crossorigin href="/assets/${f}">`)
          .join('\n    ');
        if (links) {
          const html = fs.readFileSync(htmlPath, 'utf-8');
          fs.writeFileSync(htmlPath, html.replace('</title>', `</title>\n    ${links}`));
        }
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), fontPreload()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    // RB_CLIENT_PORT lets e2e run its own client (5174) alongside the dev
    // client (5173) with an isolated API target — tests never touch dev data.
    port: Number(process.env.RB_CLIENT_PORT || 5173),
    strictPort: Boolean(process.env.RB_CLIENT_PORT),
    proxy: {
      '/api': {
        // RB_API_TARGET lets e2e point its own client instance at an isolated
        // API server (playwright runs client on 5174 + API on 8790 so tests
        // never touch the dev/user database). Dev default stays 8787.
        target: process.env.RB_API_TARGET || 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': {
        target: process.env.RB_API_TARGET || 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
});
