import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import type { Admin, AdminRole, Student } from '@prisma/client';
import { config } from '../config/env';
import { errors } from './errors';

const BCRYPT_COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

export function sha256Hex(input: string | Buffer): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

export function generateDeviceApiKey(): string {
  return `kiosk_${crypto.randomBytes(32).toString('base64url')}`;
}

/** Deterministic per-student temporary password, e.g. `Tmp-7f3a9c2d`. */
export function generateTemporaryPassword(): string {
  return `Tmp-${crypto.randomBytes(5).toString('hex')}`;
}

export interface AdminTokenPayload {
  sub: string;
  actorType: 'admin';
  role: AdminRole;
}

export interface StudentTokenPayload {
  sub: string;
  actorType: 'student';
}

export type AuthTokenPayload = AdminTokenPayload | StudentTokenPayload;

function sign(payload: AuthTokenPayload): string {
  const options: SignOptions = {
    algorithm: 'HS256',
    expiresIn: config.jwtExpiresIn as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, config.jwtSecret, options);
}

export function signAdminToken(admin: Pick<Admin, 'id' | 'role'>): string {
  return sign({ sub: admin.id.toString(), actorType: 'admin', role: admin.role });
}

export function signStudentToken(student: Pick<Student, 'studentId'>): string {
  return sign({ sub: student.studentId, actorType: 'student' });
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  let decoded: unknown;
  try {
    decoded = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    throw errors.unauthorized('Invalid or expired token');
  }

  if (typeof decoded !== 'object' || decoded === null) {
    throw errors.unauthorized('Invalid token payload');
  }

  const payload = decoded as Record<string, unknown>;
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw errors.unauthorized('Invalid token payload');
  }
  if (payload.actorType === 'admin') {
    const role = payload.role;
    if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
      throw errors.unauthorized('Invalid token payload');
    }
    return { sub: payload.sub, actorType: 'admin', role };
  }
  if (payload.actorType === 'student') {
    return { sub: payload.sub, actorType: 'student' };
  }
  throw errors.unauthorized('Invalid token payload');
}

export function sha256OfDescriptor(descriptor: number[]): string {
  return sha256Hex(JSON.stringify(descriptor));
}
