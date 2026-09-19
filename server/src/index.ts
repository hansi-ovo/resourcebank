import express from 'express';
import { placeholderBody } from './seedimg';
import { config } from './config';

const app = express();
app.use(express.json());

const startTime = Date.now();

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, uptimeMs: Date.now() - startTime });
});
app.get('/api/seedimg/:cat/:file', (req, res) => {
  const ok = placeholderBody(req.params.cat, req.params.file);
  if (!ok) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.type(ok.type).send(ok.body);
});

const port = config.port;
app.listen(port, () => {
  console.log(`[server] listening on :${port} (searchDelayMs=${config.searchDelayMs})`);
});
