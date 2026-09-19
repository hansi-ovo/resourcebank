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
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
});
