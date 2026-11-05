import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { ApiError, errors } from '../lib/errors';
import { formatZodError } from '../lib/http';
import { logger } from '../lib/logger';

function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown,
): void {
  res.status(status).json({
    success: false,
    error: { code, message, ...(details !== undefined ? { details } : {}) },
  });
}

interface MulterLikeError {
  name: string;
  code: string;
  field?: string;
  message: string;
}

function isMulterError(error: unknown): error is MulterLikeError {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: string }).name === 'MulterError'
  );
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(errors.notFound(`Route ${req.method} ${req.path} not found`));
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (res.headersSent) return;

  if (error instanceof ApiError) {
    sendError(res, error.status, error.code, error.message, error.details);
    return;
  }

  if (error instanceof ZodError) {
    sendError(res, 400, 'VALIDATION_ERROR', 'Invalid request data', formatZodError(error));
    return;
  }

  if (isMulterError(error)) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      sendError(res, 413, 'FILE_TOO_LARGE', 'Image exceeds the maximum upload size');
      return;
    }
    if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') {
      sendError(res, 400, 'VALIDATION_ERROR', 'Unexpected file field', {
        ...(error.field ? { field: error.field } : {}),
      });
      return;
    }
    sendError(res, 400, 'VALIDATION_ERROR', error.message || 'Invalid upload');
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      sendError(res, 409, 'CONFLICT', 'A record with this value already exists', {
        fields: error.meta?.target,
      });
      return;
    }
    if (error.code === 'P2025') {
      sendError(res, 404, 'NOT_FOUND', 'Resource not found');
      return;
    }
    if (error.code === 'P2003') {
      sendError(res, 409, 'CONFLICT', 'Related record constraint failed');
      return;
    }
  }

  // Never leak request bodies, tokens or descriptors into logs.
  logger.error('Unhandled request error', {
    error:
      error instanceof Error
        ? { name: error.name, message: error.message, stack: error.stack?.split('\n').slice(0, 6).join('\n') }
        : error,
  });
  sendError(res, 500, 'INTERNAL_ERROR', 'Unexpected server error');
}
