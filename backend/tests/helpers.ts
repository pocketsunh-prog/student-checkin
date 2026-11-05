import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import supertest from 'supertest';
import type { Settings, Student } from '@prisma/client';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';
import { initFaceService } from '../src/face';
import { invalidateDescriptorCache } from '../src/face/matcher';
import { invalidateSettingsCache } from '../src/services/settings.service';
import { sha256Hex } from '../src/lib/security';
import { freezeClock, now, resetClock } from '../src/lib/clock';
import { parseDateOnly } from '../src/lib/time';

export const app = createApp();
export const request = supertest(app);

export const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const TEST_TIMEZONE = 'Asia/Hong_Kong';

/** A valid magic-byte PNG whose bytes deterministically drive the mock provider. */
export function fakePng(marker: string): Buffer {
  return Buffer.concat([PNG_SIGNATURE, Buffer.from(marker)]);
}

/** Freeze the app clock (e.g. 2026-03-03T00:03:00.000Z == 08:03 in Hong Kong). */
export function freezeAt(iso: string): void {
  freezeClock(new Date(iso));
}

export function resetTestClock(): void {
  resetClock();
}

export async function resetDb(): Promise<void> {
  // Ensure the face provider is initialised before any enrollment test runs.
  await initFaceService();
  resetClock();

  await prisma.scanEvent.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.student.deleteMany();
  await prisma.device.deleteMany();
  await prisma.admin.deleteMany();
  await prisma.settings.deleteMany();

  // The app caches descriptors and settings in memory; the DB was just wiped.
  invalidateDescriptorCache();
  invalidateSettingsCache();
}

export interface SettingsOverrides {
  schoolName?: string;
  dayStartTime?: string;
  lateGraceMinutes?: number;
  timezone?: string;
  faceMatchThreshold?: number;
  schoolDays?: number[];
}

export async function createSettings(overrides: SettingsOverrides = {}): Promise<Settings> {
  return prisma.settings.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      schoolDays: [1, 2, 3, 4, 5],
      faceMatchThreshold: 0.6,
      ...overrides,
    },
    update: { ...overrides },
  });
}

export const DEFAULT_ADMIN = {
  email: 'admin@school.edu',
  password: 'Admin@12345',
  name: 'School Administrator',
};

export async function createAdmin(
  email = DEFAULT_ADMIN.email,
  password = DEFAULT_ADMIN.password,
  name = DEFAULT_ADMIN.name,
): Promise<void> {
  await prisma.admin.create({
    data: {
      email,
      name,
      // Low cost factor keeps the test suite fast; production seed uses 12.
      passwordHash: await bcrypt.hash(password, 4),
      role: 'SUPER_ADMIN',
    },
  });
}

export async function loginAdmin(
  email = DEFAULT_ADMIN.email,
  password = DEFAULT_ADMIN.password,
): Promise<string> {
  const response = await request.post('/api/auth/admin/login').send({ email, password });
  if (response.status !== 200 || !response.body?.data?.token) {
    throw new Error(`Admin login failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return response.body.data.token as string;
}

export async function createAdminAndToken(): Promise<string> {
  await createAdmin();
  return loginAdmin();
}

export interface TestDevice {
  id: string;
  apiKey: string;
}

export const DEFAULT_DEVICE_KEY = 'test-kiosk-key-12345';

export async function createDevice(
  apiKey = DEFAULT_DEVICE_KEY,
  overrides: { name?: string; location?: string; active?: boolean } = {},
): Promise<TestDevice> {
  const device = await prisma.device.create({
    data: {
      id: crypto.randomUUID(),
      name: overrides.name ?? 'Test Kiosk',
      location: overrides.location ?? 'Main Gate',
      apiKeyHash: sha256Hex(apiKey),
      apiKeyPrefix: apiKey.slice(0, 16),
      active: overrides.active ?? true,
    },
  });
  return { id: device.id, apiKey };
}

export const DEFAULT_STUDENT = {
  studentId: 'STU1001',
  firstName: 'Mei',
  lastName: 'Chan',
  dob: '2011-04-19',
  sex: 'FEMALE',
  class: '7A',
  form: 'Form 2',
  password: 'Student@12345',
};

export interface RegisterOptions {
  studentId?: string;
  firstName?: string;
  lastName?: string;
  dob?: string;
  sex?: string;
  class?: string;
  form?: string;
  password?: string;
  faceMarker?: string;
}

/** Register a student through the public multipart endpoint (returns the body). */
export async function registerStudent(options: RegisterOptions = {}) {
  const fields = {
    ...DEFAULT_STUDENT,
    ...Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined)),
  } as Record<string, string>;
  delete fields.faceMarker;

  const req = request
    .post('/api/auth/student/register')
    .field('studentId', fields.studentId!)
    .field('firstName', fields.firstName!)
    .field('lastName', fields.lastName!)
    .field('dob', fields.dob!)
    .field('sex', fields.sex!)
    .field('class', fields.class!)
    .field('form', fields.form!)
    .field('password', fields.password!);

  return req.attach(
    'faceImage',
    fakePng(options.faceMarker ?? `${fields.studentId}-face`),
    { filename: 'face.png', contentType: 'image/png' },
  );
}

export interface DirectStudentOptions {
  studentId: string;
  firstName?: string;
  lastName?: string;
  class?: string;
  form?: string;
  status?: 'ACTIVE' | 'INACTIVE';
  password?: string;
  withFace?: string;
  /** Enrollment date used for absence synthesis (defaults to 2026-01-01). */
  createdAt?: string | Date;
}

/** A date before every fixture range, so historical absences are expected. */
export const HISTORICAL_CREATED_AT = '2026-01-01T00:00:00.000Z';

/** Create a student directly in the DB (no face detection needed). */
export async function createStudentDirect(options: DirectStudentOptions): Promise<Student> {
  const password = options.password ?? DEFAULT_STUDENT.password;
  const faceMarker = options.withFace;
  return prisma.student.create({
    data: {
      studentId: options.studentId,
      firstName: options.firstName ?? 'Mei',
      lastName: options.lastName ?? 'Chan',
      dob: new Date('2011-04-19T00:00:00.000Z'),
      sex: 'FEMALE',
      class: options.class ?? '7A',
      form: options.form ?? 'Form 2',
      passwordHash: await bcrypt.hash(password, 4),
      status: options.status ?? 'ACTIVE',
      createdAt: options.createdAt ? new Date(options.createdAt) : new Date(HISTORICAL_CREATED_AT),
      ...(faceMarker
        ? {
            faceDescriptor: descriptorFor(faceMarker),
            faceDescriptorHash: sha256Hex(JSON.stringify(descriptorFor(faceMarker))),
            faceEnrolledAt: now(),
          }
        : {}),
    },
  });
}

/** Move an existing student's enrollment date into the past (API-created students). */
export async function backdateStudent(
  studentId: string,
  createdAt: string = HISTORICAL_CREATED_AT,
): Promise<void> {
  await prisma.student.update({
    where: { studentId },
    data: { createdAt: new Date(createdAt) },
  });
}

// Imported lazily to avoid a circular import at module load time.
import { descriptorFromImage } from '../src/face/mock';

function descriptorFor(marker: string): number[] {
  return descriptorFromImage(fakePng(marker));
}

export async function studentToken(studentId = DEFAULT_STUDENT.studentId): Promise<string> {
  const response = await request
    .post('/api/auth/student/login')
    .send({ studentId, password: DEFAULT_STUDENT.password });
  if (response.status !== 200 || !response.body?.data?.token) {
    throw new Error(`Student login failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return response.body.data.token as string;
}

export function authHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

export function deviceHeader(apiKey: string): { 'X-Device-Key': string } {
  return { 'X-Device-Key': apiKey };
}

export function kioskVerify(apiKey: string, marker: string, mode?: string) {
  const req = request
    .post('/api/kiosk/verify')
    .set('X-Device-Key', apiKey);
  if (mode) req.field('mode', mode);
  return req.attach('image', fakePng(marker), { filename: 'scan.png', contentType: 'image/png' });
}

/** Count audit rows written by kiosk scans. */
export async function scanEventCount(): Promise<number> {
  return prisma.scanEvent.count();
}

export function isoForSchoolTime(date: string, time: string): string {
  return `${date}T${time}:00+08:00`;
}

export interface AttendanceRowOptions {
  studentId: string;
  date: string;
  status?: 'PRESENT' | 'LATE' | 'ABSENT';
  checkInAt?: Date | null;
  checkOutAt?: Date | null;
  lateMinutes?: number;
  method?: 'FACE' | 'MANUAL';
  note?: string | null;
}

/** Insert an attendance row directly (for report/dashboard fixtures). */
export async function createAttendanceRow(options: AttendanceRowOptions) {
  return prisma.attendance.create({
    data: {
      studentId: options.studentId,
      date: parseDateOnly(options.date),
      checkInAt: options.checkInAt ?? null,
      checkOutAt: options.checkOutAt ?? null,
      status: options.status ?? 'PRESENT',
      lateMinutes: options.lateMinutes ?? 0,
      method: options.method ?? 'FACE',
      note: options.note ?? null,
    },
  });
}

export { prisma };
