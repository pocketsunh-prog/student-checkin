import type { NextFunction, Request, Response } from 'express';
import { logger } from '../lib/logger';

/** Request log line without bodies, query strings or auth headers. */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    logger.debug(`${req.method} ${req.path} ${res.statusCode} ${durationMs.toFixed(1)}ms`);
  });
  next();
}
