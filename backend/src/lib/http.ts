import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodError, ZodType } from 'zod';
import { errors } from './errors';

export function sendOk<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ success: true, data });
}

export type AsyncRouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;

/**
 * Wraps async handlers so rejected promises reach the Express error middleware
 * (works on both Express 4 and 5).
 */
export function asyncHandler(handler: AsyncRouteHandler): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function formatZodError(error: ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_';
    const bucket = fields[key] ?? (fields[key] = []);
    bucket.push(issue.message);
  }
  return fields;
}

/** Validate `value` with a zod schema, throwing the contract's 400 envelope on failure. */
export function parseOrThrow<T>(schema: ZodType<T>, value: unknown, message?: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw errors.validation(message ?? 'Invalid request data', formatZodError(result.error));
  }
  return result.data;
}

export function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Express 5 route params can be typed as string | string[]; normalise safely. */
export function pathParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

export function toBigIntId(value: string, label = 'id'): bigint {
  if (!/^\d+$/.test(value)) {
    throw errors.notFound(`${label} not found`);
  }
  return BigInt(value);
}

export function parseIsoDate(value: string, field: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw errors.validation(`Invalid ${field}`, { [field]: ['Expected an ISO-8601 timestamp'] });
  }
  return parsed;
}
