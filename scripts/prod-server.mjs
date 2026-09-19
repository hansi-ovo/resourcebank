/**
 * Production-parity server for measurement (mirrors the Nginx topology in
 * 01-architecture §9): serves client/dist statically, proxies /api to the
 * Express server on :8787. Usage: node scripts/prod-server.mjs [port]
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '../client/dist');
const API_TARGET = process.env.API_TARGET ?? 'http://localhost:8787';
const PORT = Number(process.argv[2] ?? 4174);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.webmanifest': 'application/manifest+json',
  '.map': 'application/json',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) {
    const target = new URL(url.pathname + url.search, API_TARGET);
    const proxy = http.request(target, { method: req.method, headers: { ...req.headers, host: target.host } }, (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    });
    proxy.on('error', () => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'api unreachable' }));
    });
    req.pipe(proxy);
    return;
  }

  let file = path.join(DIST, url.pathname === '/' ? 'index.html' : url.pathname);
  if (!file.startsWith(DIST)) {
    res.writeHead(403).end();
    return;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(DIST, 'index.html'); // SPA fallback
  }
  const ext = path.extname(file);
  const immutable = url.pathname.startsWith('/assets/') || url.pathname.startsWith('/seed/');
  const raw = fs.readFileSync(file);
  const accepts = String(req.headers['accept-encoding'] ?? '');
  let body = raw;
  let encoding = undefined;
  const compressible = ['.html', '.js', '.css', '.svg', '.json', '.webmanifest', '.map'].includes(ext);
  if (compressible && accepts.includes('br')) {
    body = zlib.brotliCompressSync(raw);
    encoding = 'br';
  } else if (compressible && accepts.includes('gzip')) {
    body = zlib.gzipSync(raw);
    encoding = 'gzip';
  }
  res.writeHead(200, {
    'Content-Type': TYPES[ext] ?? 'application/octet-stream',
    'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    'Content-Length': body.length,
    ...(encoding ? { 'Content-Encoding': encoding } : {}),
  });
  res.end(body);
});

server.listen(PORT, () => console.log(`prod-parity server on :${PORT} (dist=${DIST})`));
