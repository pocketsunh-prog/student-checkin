import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import {
  authHeader,
  createAdmin,
  createAttendanceRow,
  createDevice,
  createSettings,
  createStudentDirect,
  freezeAt,
  loginAdmin,
  request,
  resetDb,
  resetTestClock,
} from './helpers';

const TODAY = '2026-03-03'; // Tuesday
const YESTERDAY = '2026-03-02'; // Monday

async function seedAttendanceFixtures() {
  await createStudentDirect({ studentId: 'STU001', firstName: 'Mei', lastName: 'Chan', class: '7A' });
  await createStudentDirect({ studentId: 'STU002', firstName: 'Kai', lastName: 'Wong', class: '7A' });
  await createStudentDirect({ studentId: 'STU003', firstName: 'Ling', lastName: 'Ho', class: '7B' });

  // Monday: STU001 present, STU002 late, STU003 absent.
  await createAttendanceRow({
    studentId: 'STU001',
    date: YESTERDAY,
    status: 'PRESENT',
    checkInAt: new Date('2026-03-02T00:01:00.000Z'),
  });
  await createAttendanceRow({
    studentId: 'STU002',
    date: YESTERDAY,
    status: 'LATE',
    lateMinutes: 5,
    checkInAt: new Date('2026-03-02T00:10:00.000Z'),
  });

  // Tuesday: STU001 present + checked out, STU002 present, STU003 absent.
  await createAttendanceRow({
    studentId: 'STU001',
    date: TODAY,
    status: 'PRESENT',
    checkInAt: new Date('2026-03-03T00:00:00.000Z'),
    checkOutAt: new Date('2026-03-03T07:00:00.000Z'),
  });
  await createAttendanceRow({
    studentId: 'STU002',
    date: TODAY,
    status: 'PRESENT',
    checkInAt: new Date('2026-03-03T00:02:00.000Z'),
  });
}

describe('Reports and dashboard aggregation', () => {
  let adminJwt: string;

  beforeEach(async () => {
    await resetDb();
    await createSettings();
    await createAdmin();
    adminJwt = await loginAdmin();
    freezeAt('2026-03-03T01:00:00.000Z'); // 09:00 HK
    await seedAttendanceFixtures();
  });

  afterEach(() => {
    resetTestClock();
  });

  it('summarises attendance by day and student', async () => {
    const response = await request
      .get(`/api/reports/summary?from=${YESTERDAY}&to=${TODAY}`)
      .set(authHeader(adminJwt));

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      from: YESTERDAY,
      to: TODAY,
      totals: { studentDays: 6, present: 3, late: 1, absent: 2, attendanceRate: 66.67 },
    });
    expect(response.body.data.days).toEqual([
      { date: YESTERDAY, present: 1, late: 1, absent: 1, total: 3 },
      { date: TODAY, present: 2, late: 0, absent: 1, total: 3 },
    ]);
    const students = response.body.data.students as Array<Record<string, unknown>>;
    expect(students).toHaveLength(3);
    expect(students.find((student) => student.studentId === 'STU003')).toMatchObject({
      present: 0,
      late: 0,
      absent: 2,
    });
    expect(students.find((student) => student.studentId === 'STU002')).toMatchObject({
      present: 1,
      late: 1,
      absent: 0,
    });
  });

  it('filters reports by class and accepts groupBy', async () => {
    const byClass = await request
      .get(`/api/reports/summary?from=${YESTERDAY}&to=${TODAY}&class=7A&groupBy=student`)
      .set(authHeader(adminJwt));

    expect(byClass.status).toBe(200);
    expect(byClass.body.data.totals).toMatchObject({
      studentDays: 4,
      present: 3,
      late: 1,
      absent: 0,
      attendanceRate: 100,
    });
    expect(byClass.body.data.students).toHaveLength(2);
    expect(byClass.body.data.days).toHaveLength(2);
  });

  it('validates report ranges', async () => {
    const inverted = await request
      .get(`/api/reports/summary?from=${TODAY}&to=${YESTERDAY}`)
      .set(authHeader(adminJwt));
    expect(inverted.status).toBe(400);

    const tooLong = await request
      .get('/api/reports/summary?from=2024-01-01&to=2026-01-01')
      .set(authHeader(adminJwt));
    expect(tooLong.status).toBe(400);

    const missing = await request
      .get('/api/reports/summary')
      .set(authHeader(adminJwt));
    expect(missing.status).toBe(400);
  });

  it('returns dashboard stats, recent scans and a 7-day late trend', async () => {
    const { id: deviceId } = await createDevice();
    await prisma.scanEvent.create({
      data: {
        deviceId,
        studentId: 'STU001',
        action: 'CHECK_IN',
        result: 'SUCCESS',
        confidence: 0.93,
        createdAt: new Date('2026-03-03T00:00:00.000Z'),
      },
    });

    const response = await request
      .get(`/api/dashboard?date=${TODAY}`)
      .set(authHeader(adminJwt));

    expect(response.status).toBe(200);
    expect(response.body.data.date).toBe(TODAY);
    expect(response.body.data.stats).toEqual({
      totalStudents: 3,
      present: 2,
      late: 0,
      absent: 1,
      checkedOut: 1,
      checkInRate: 66.67,
    });
    expect(response.body.data.recentScans).toHaveLength(1);
    expect(response.body.data.recentScans[0]).toMatchObject({
      studentId: 'STU001',
      fullName: 'Mei Chan',
      action: 'CHECK_IN',
      status: 'PRESENT',
      device: 'Test Kiosk',
      at: `${TODAY}T08:00:00+08:00`,
    });

    const trend = response.body.data.lateTrend as Array<Record<string, unknown>>;
    expect(trend).toHaveLength(7);
    expect(trend[trend.length - 1]).toEqual({ date: TODAY, late: 0, present: 2, absent: 1 });
    expect(trend[trend.length - 2]).toEqual({
      date: YESTERDAY,
      late: 1,
      present: 1,
      absent: 1,
    });
    // 2026-02-25 is a school day with no rows -> everyone absent.
    expect(trend[0]).toEqual({ date: '2026-02-25', late: 0, present: 0, absent: 3 });
    // Weekend days never report absences (2026-02-28 Sat, 2026-03-01 Sun).
    expect(trend[3]).toEqual({ date: '2026-02-28', late: 0, present: 0, absent: 0 });
    expect(trend[4]).toEqual({ date: '2026-03-01', late: 0, present: 0, absent: 0 });
  });

  it('defaults the dashboard to the frozen school date and validates input', async () => {
    const defaulted = await request.get('/api/dashboard').set(authHeader(adminJwt));
    expect(defaulted.body.data.date).toBe(TODAY);

    const invalid = await request
      .get('/api/dashboard?date=2026-02-30')
      .set(authHeader(adminJwt));
    expect(invalid.status).toBe(400);
  });
});
