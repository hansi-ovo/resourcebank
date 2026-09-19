import { Router } from 'express';
import { z } from 'zod';
import type { AuthDeps } from '../auth';
import { RateLimiter, clearedCookie, createSessionValue, isAdmin, sessionCookie } from '../auth';

const loginSchema = z.object({ password: z.string().min(1).max(200) });

export function authRoutes(deps: AuthDeps): Router {
  const router = Router();
  const limiter = new RateLimiter(5, 60_000); // 5/min/IP (01-architecture §6)

  router.post('/api/login', (req, res) => {
    const ip = req.ip ?? 'unknown';
    // Failed-attempt limiter (5/min/IP): successes don't burn the budget —
    // an admin signing in repeatedly must not lock themselves out.
    if (!limiter.check(ip, Date.now(), false)) {
      res.status(429).json({ error: 'Too many attempts. Try again in a minute.' });
      return;
    }
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request' });
      return;
    }
    if (parsed.data.password !== deps.adminPassword) {
      limiter.count(ip, Date.now()); // only failures consume the budget
      res.status(401).json({ error: 'Wrong password. Try again.' });
      return;
    }
    res.setHeader('Set-Cookie', sessionCookie(createSessionValue(Date.now(), deps.sessionSecret)));
    res.json({ ok: true });
  });

  router.post('/api/logout', (req, res) => {
    if (!isAdmin(req, deps.sessionSecret)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    res.setHeader('Set-Cookie', clearedCookie());
    res.json({ ok: true });
  });

  return router;
}
