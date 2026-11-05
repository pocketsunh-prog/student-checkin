/**
 * Idempotent database seed.
 *
 *   npx tsx prisma/seed.ts      (or: npm run seed)
 *
 * Creates: settings row, seed admin, demo kiosk device, 12 demo students and
 * (optionally) realistic attendance for the last 7 school days so the admin
 * dashboard/reports/CSV are meaningful out of the box.
 *
 * Re-running is safe: rows are upserted with `update: {}` so real data is never
 * overwritten.
 */
import { PrismaClient, type Settings, type Sex } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { config } from '../src/config/env';
import {
  attendanceStatusFromSettings,
  addDays,
  getSchoolParts,
  isSchoolDay,
  parseDateOnly,
  parseHhMm,
  parseSchoolDays,
  toSchoolDateString,
} from '../src/lib/time';
import { sha256Hex } from '../src/lib/security';

const prisma = new PrismaClient();

const BCRYPT_COST = 12;

interface DemoStudent {
  studentId: string;
  firstName: string;
  lastName: string;
  dob: string;
  sex: Sex;
  class: string;
  form: string;
}

const DEMO_STUDENTS: DemoStudent[] = [
  { studentId: 'STU001', firstName: 'Mei', lastName: 'Chan', dob: '2011-04-19', sex: 'FEMALE', class: '7A', form: 'Form 2' },
  { studentId: 'STU002', firstName: 'Kai', lastName: 'Wong', dob: '2011-07-02', sex: 'MALE', class: '7A', form: 'Form 2' },
  { studentId: 'STU003', firstName: 'Ling', lastName: 'Ho', dob: '2011-01-28', sex: 'FEMALE', class: '7A', form: 'Form 2' },
  { studentId: 'STU004', firstName: 'Tsz', lastName: 'Lam', dob: '2011-09-14', sex: 'MALE', class: '7A', form: 'Form 2' },
  { studentId: 'STU005', firstName: 'Yan', lastName: 'Lee', dob: '2011-03-05', sex: 'FEMALE', class: '7B', form: 'Form 2' },
  { studentId: 'STU006', firstName: 'Chun', lastName: 'Ng', dob: '2011-11-21', sex: 'MALE', class: '7B', form: 'Form 2' },
  { studentId: 'STU007', firstName: 'Wing', lastName: 'Cheung', dob: '2011-06-11', sex: 'FEMALE', class: '7B', form: 'Form 2' },
  { studentId: 'STU008', firstName: 'Ho', lastName: 'Yip', dob: '2011-08-30', sex: 'MALE', class: '7B', form: 'Form 2' },
  { studentId: 'STU009', firstName: 'Sze', lastName: 'Chow', dob: '2010-02-17', sex: 'FEMALE', class: '7C', form: 'Form 3' },
  { studentId: 'STU010', firstName: 'Ka', lastName: 'Lau', dob: '2010-05-23', sex: 'MALE', class: '7C', form: 'Form 3' },
  { studentId: 'STU011', firstName: 'Pui', lastName: 'Tse', dob: '2010-12-08', sex: 'FEMALE', class: '7C', form: 'Form 3' },
  { studentId: 'STU012', firstName: 'Hin', lastName: 'Kwok', dob: '2010-10-01', sex: 'MALE', class: '7C', form: 'Form 3' },
];

/** Convert a school-local date + minute-of-day to the matching UTC instant. */
function schoolDateAtMinutes(dateString: string, minutesOfDay: number, timeZone: string): Date {
  const [year, month, day] = dateString.split('-').map(Number) as [number, number, number];
  const hour = Math.floor(minutesOfDay / 60);
  const minute = minutesOfDay % 60;
  const target = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  let guess = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = getSchoolParts(new Date(guess), timeZone);
    const actual = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0, 0);
    const diff = target - actual;
    if (diff === 0) return new Date(guess);
    guess += diff;
  }
  return new Date(guess);
}

async function seedSettings(): Promise<Settings> {
  const existing = await prisma.settings.findUnique({ where: { id: 1 } });
  if (existing) {
    return existing;
  }
  return prisma.settings.create({
    data: {
      id: 1,
      schoolName: 'Greenfield Secondary School',
      dayStartTime: '08:00',
      lateGraceMinutes: 5,
      timezone: 'Asia/Hong_Kong',
      faceMatchThreshold: config.face.matchThreshold,
      schoolDays: [1, 2, 3, 4, 5],
    },
  });
}

async function seedAdmin(): Promise<void> {
  const email = config.seed.adminEmail.toLowerCase();
  const existing = await prisma.admin.findUnique({ where: { email } });
  if (existing) {
    console.log(`  admin: ${email} already exists (password left unchanged)`);
    return;
  }
  await prisma.admin.create({
    data: {
      email,
      name: config.seed.adminName,
      passwordHash: await bcrypt.hash(config.seed.adminPassword, BCRYPT_COST),
      role: 'SUPER_ADMIN',
    },
  });
  console.log(`  admin: created ${email}`);
}

async function seedDevice(): Promise<void> {
  const apiKeyHash = sha256Hex(config.seed.deviceKey);
  const existing = await prisma.device.findUnique({ where: { apiKeyHash } });
  if (existing) {
    console.log(`  device: "${existing.name}" already exists with the demo key`);
    return;
  }
  const crypto = await import('node:crypto');
  await prisma.device.create({
    data: {
      id: crypto.randomUUID(),
      name: config.seed.deviceName,
      location: config.seed.deviceLocation,
      apiKeyHash,
      apiKeyPrefix: config.seed.deviceKey.slice(0, 16),
    },
  });
  console.log(`  device: created "${config.seed.deviceName}" with the demo key`);
}

async function seedStudents(settings: Settings): Promise<string[]> {
  if (!config.seed.demoStudents) {
    console.log('  students: SEED_DEMO_STUDENTS=false, skipping demo students');
    return [];
  }

  const timeZone = settings.timezone;
  const today = toSchoolDateString(new Date(), timeZone);
  // Demo students must predate the seeded attendance window, otherwise their
  // historical absences would (correctly) no longer be synthesized.
  const backdatedCreatedAt = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const passwordHash = await bcrypt.hash('Student@12345', BCRYPT_COST);
  let created = 0;
  let backdated = 0;
  for (const student of DEMO_STUDENTS) {
    const existing = await prisma.student.findUnique({
      where: { studentId: student.studentId },
      select: { studentId: true, createdAt: true },
    });
    if (existing) {
      // One-off migration for demo rows created by an earlier seed run on the
      // same day; never rewrite createdAt once it is historical.
      if (toSchoolDateString(existing.createdAt, timeZone) === today) {
        await prisma.student.update({
          where: { studentId: student.studentId },
          data: { createdAt: backdatedCreatedAt },
        });
        backdated += 1;
      }
      continue;
    }
    await prisma.student.create({
      data: {
        studentId: student.studentId,
        firstName: student.firstName,
        lastName: student.lastName,
        dob: parseDateOnly(student.dob),
        sex: student.sex,
        class: student.class,
        form: student.form,
        passwordHash,
        createdAt: backdatedCreatedAt,
      },
    });
    created += 1;
  }
  console.log(
    `  students: ${created} created, ${backdated} backdated to ${toSchoolDateString(
      backdatedCreatedAt,
      timeZone,
    )}, ${DEMO_STUDENTS.length - created - backdated} already historical (password Student@12345)`,
  );
  return DEMO_STUDENTS.map((student) => student.studentId);
}

interface SeedAttendanceRow {
  studentId: string;
  date: string;
  checkInAt: Date;
  checkOutAt: Date | null;
  status: 'PRESENT' | 'LATE';
  lateMinutes: number;
}

async function seedDemoAttendance(settings: Settings, studentIds: string[]): Promise<void> {
  if (!config.seed.demoStudents || studentIds.length < 12) return;

  const timeZone = settings.timezone;
  const schoolDays = parseSchoolDays(settings.schoolDays);
  const startMinutes = parseHhMm(settings.dayStartTime);
  const grace = settings.lateGraceMinutes;
  const threshold = startMinutes + grace;

  const nowParts = getSchoolParts(new Date(), timeZone);
  const nowMinutes = nowParts.hour * 60 + nowParts.minute;
  const todayParts = nowParts;
  const today = `${todayParts.year}-${String(todayParts.month).padStart(2, '0')}-${String(todayParts.day).padStart(2, '0')}`;

  // Last 7 school days strictly before today, oldest first.
  const pastDates: string[] = [];
  let cursor = addDays(today, -1);
  while (pastDates.length < 7) {
    if (isSchoolDay(cursor, schoolDays)) pastDates.push(cursor);
    cursor = addDays(cursor, -1);
  }
  pastDates.reverse();

  const rows: SeedAttendanceRow[] = [];

  for (const [dateIndex, date] of pastDates.entries()) {
    // STU001-STU008: present (arrive up to 15 minutes before the start time).
    for (let index = 0; index < 8; index += 1) {
      const studentId = studentIds[index]!;
      const spread = Math.max(1, 15 + grace);
      const offset = -15 + ((dateIndex * 3 + index) % spread);
      const checkInAt = schoolDateAtMinutes(date, startMinutes + offset, timeZone);
      const { status, lateMinutes } = attendanceStatusFromSettings(checkInAt, settings);
      rows.push({
        studentId,
        date,
        checkInAt,
        checkOutAt: new Date(checkInAt.getTime() + 7 * 60 * 60 * 1000),
        status,
        lateMinutes,
      });
    }
    // STU009-STU010: late by 4-12 minutes beyond the grace period.
    for (let index = 8; index < 10; index += 1) {
      const studentId = studentIds[index]!;
      const lateMinutes = 4 + ((dateIndex + index) % 9);
      const checkInAt = schoolDateAtMinutes(date, threshold + lateMinutes, timeZone);
      rows.push({
        studentId,
        date,
        checkInAt,
        checkOutAt: new Date(checkInAt.getTime() + 7 * 60 * 60 * 1000),
        status: 'LATE',
        lateMinutes,
      });
    }
    // STU011-STU012 intentionally have no row -> derived ABSENT.
  }

  // Today: only when the school day has already started; never future timestamps.
  if (nowMinutes >= threshold) {
    const todayRules: { index: number; late: boolean }[] = [
      { index: 0, late: false },
      { index: 1, late: false },
      { index: 2, late: false },
      { index: 3, late: false },
      { index: 4, late: false },
      { index: 5, late: true },
      { index: 6, late: true },
    ];
    for (const [order, rule] of todayRules.entries()) {
      const studentId = studentIds[rule.index]!;
      let checkInMinutes: number;
      let lateMinutes = 0;
      if (rule.late) {
        lateMinutes = 6 + order;
        checkInMinutes = threshold + lateMinutes;
        if (checkInMinutes > nowMinutes - 1) continue;
      } else {
        checkInMinutes = Math.min(nowMinutes - 1 - order * 2, threshold - 1);
        if (checkInMinutes < 0) continue;
        const status = attendanceStatusFromSettings(
          schoolDateAtMinutes(today, checkInMinutes, timeZone),
          settings,
        );
        lateMinutes = status.lateMinutes;
      }
      const checkInAt = schoolDateAtMinutes(today, checkInMinutes, timeZone);
      // Check out the first four students only if that time has already passed.
      const checkoutCandidate = checkInMinutes + 4 * 60;
      const checkOutAt =
        rule.index <= 3 && checkoutCandidate <= nowMinutes - 1
          ? schoolDateAtMinutes(today, checkoutCandidate, timeZone)
          : null;
      rows.push({
        studentId,
        date: today,
        checkInAt,
        checkOutAt,
        status: lateMinutes > 0 ? 'LATE' : 'PRESENT',
        lateMinutes,
      });
    }
  }

  let inserted = 0;
  for (const row of rows) {
    const result = await prisma.attendance.upsert({
      where: {
        studentId_date: { studentId: row.studentId, date: parseDateOnly(row.date) },
      },
      create: {
        studentId: row.studentId,
        date: parseDateOnly(row.date),
        checkInAt: row.checkInAt,
        checkOutAt: row.checkOutAt,
        status: row.status,
        lateMinutes: row.lateMinutes,
        method: 'FACE',
      },
      update: {},
    });
    if (result) inserted += 1;
  }
  console.log(
    `  attendance: ${rows.length} demo rows upserted (${pastDates.length} past school days + today)`,
  );
}

async function main(): Promise<void> {
  console.log('Seeding database...');
  const settings = await seedSettings();
  console.log(`  settings: ready (${settings.schoolName}, ${settings.timezone})`);
  await seedAdmin();
  await seedDevice();
  const studentIds = await seedStudents(settings);
  await seedDemoAttendance(settings, studentIds);
  console.log('Seed complete.');
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
