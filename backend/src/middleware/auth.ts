import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { errors } from '../lib/errors';
import { sha256Hex, verifyAuthToken } from '../lib/security';
import { now } from '../lib/clock';
import type { AuthContext } from '../types/express';

function readBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, ...rest] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || rest.length === 0) return null;
  const token = rest.join(' ').trim();
  return token.length > 0 ? token : null;
}

/** Authenticate an admin or student JWT and attach req.auth. */
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = readBearerToken(req);
    if (!token) throw errors.unauthorized('Missing Authorization bearer token');

    const payload = verifyAuthToken(token);
    let context: AuthContext;

    if (payload.actorType === 'admin') {
      let adminId: bigint;
      try {
        adminId = BigInt(payload.sub);
      } catch {
        throw errors.unauthorized('Invalid token payload');
      }
      const admin = await prisma.admin.findUnique({ where: { id: adminId } });
      if (!admin) throw errors.unauthorized('Invalid token');
      context = { actorType: 'admin', admin };
    } else {
      const student = await prisma.student.findUnique({ where: { studentId: payload.sub } });
      if (!student) throw errors.unauthorized('Invalid token');
      if (student.status !== 'ACTIVE') throw errors.unauthorized('Student account is inactive');
      context = { actorType: 'student', student };
    }

    req.auth = context;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth) return next(errors.unauthorized('Authentication required'));
  if (req.auth.actorType !== 'admin') return next(errors.forbidden('Admin access required'));
  next();
}

export function requireStudent(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth) return next(errors.unauthorized('Authentication required'));
  if (req.auth.actorType !== 'student') return next(errors.forbidden('Student access required'));
  next();
}

export function requireAnyActor(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth) return next(errors.unauthorized('Authentication required'));
  next();
}

/** Authenticate a kiosk device by X-Device-Key and update lastSeenAt. */
export async function authenticateDevice(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const rawKey = req.headers['x-device-key'];
    const key = Array.isArray(rawKey) ? rawKey[0] : rawKey;
    if (!key || key.trim().length === 0) {
      throw errors.unauthorized('Missing X-Device-Key header');
    }

    const device = await prisma.device.findUnique({
      where: { apiKeyHash: sha256Hex(key.trim()) },
    });
    if (!device || !device.active) {
      throw errors.unauthorized('Invalid or inactive device key');
    }

    const updated = await prisma.device.update({
      where: { id: device.id },
      data: { lastSeenAt: now() },
    });
    req.device = updated;
    next();
  } catch (error) {
    next(error);
  }
}
