import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

/**
 * Shared-password auth (01-architecture.md §6):
 * login sets an HMAC-signed httpOnly cookie `rb_session` valid 7 days.
 */

const COOKIE = 'rb_session';
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export interface AuthDeps {
  adminPassword: string;
  sessionSecret: string;
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createSessionValue(now: number, secret: string): string {
  const payload = `admin.${now}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySessionValue(value: string | undefined, secret: string, now: number): boolean {
  if (!value) return false;
  const m = /^(admin)\.(\d+)\.([A-Za-z0-9_-]+)$/.exec(value);
  if (!m) return false;
  const [, tag, tsRaw, mac] = m;
  const expected = sign(`${tag}.${tsRaw}`, secret);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  const ts = Number(tsRaw);
  return now - ts < SEVEN_DAYS_MS && ts - now < 60_000; // not expired, not far-future
}

/** Simple in-memory rate limiter: max hits per window per key. */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private max: number, private windowMs: number) {}

  /**
   * Records an attempt for `key`. When `count=true` the attempt consumes
   * budget (use for failed logins); `count=false` only checks the budget.
   */
  check(key: string, now: number, count: boolean): boolean {
    const arr = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (arr.length >= this.max) {
      this.hits.set(key, arr);
      return false;
    }
    if (count) arr.push(now);
    this.hits.set(key, arr);
    return true;
  }

  /** Marks the latest window state for a key (used to convert check→count
   *  after a failure is confirmed). */
  count(key: string, now: number): void {
    const arr = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    arr.push(now);
    this.hits.set(key, arr);
  }
}

export function sessionCookie(value: string): string {
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SEVEN_DAYS_MS / 1000}`;
}

export function clearedCookie(): string {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function isAdmin(req: Request, secret: string): boolean {
  const raw = (req.headers.cookie ?? '')
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${COOKIE}=`));
  const value = raw?.slice(COOKIE.length + 1);
  return verifySessionValue(value, secret, Date.now());
}

export function requireAdmin(secret: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (isAdmin(req, secret)) next();
    else res.status(401).json({ error: 'Unauthorized' });
  };
}
