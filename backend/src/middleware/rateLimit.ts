import rateLimit from 'express-rate-limit';
import type { Request } from 'express';
import { config } from '../config/env';
import { sha256Hex } from '../lib/security';

function rateLimitsDisabled(): boolean {
  return config.rateLimitDisabled || config.isTest;
}

function tooManyRequests(_req: Request, res: import('express').Response): void {
  res.status(429).json({
    success: false,
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many requests. Please slow down and try again shortly.',
    },
  });
}

/** Auth endpoints: 10 requests / minute / IP. */
export const authLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: rateLimitsDisabled,
  handler: tooManyRequests,
});

/** Kiosk verify: 60 scans / minute / device (keyed by the hashed device key). */
export const kioskScanLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: rateLimitsDisabled,
  handler: tooManyRequests,
  keyGenerator: (req: Request) => {
    const raw = req.headers['x-device-key'];
    const key = Array.isArray(raw) ? raw[0] : raw;
    return `device:${sha256Hex(key ?? 'anonymous')}`;
  },
});

/** Everything else: 300 requests / minute / IP. */
export const generalLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: rateLimitsDisabled,
  handler: tooManyRequests,
});
