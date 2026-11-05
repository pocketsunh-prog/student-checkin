import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import {
  authHeader,
  createAdmin,
  createSettings,
  createStudentDirect,
  freezeAt,
  loginAdmin,
  request,
  resetDb,
  resetTestClock,
  studentToken,
} from './helpers';

const DATE = '2026-03-03'; // Tuesday (school day)

describe('Attendance list, absent synthesis and manual corrections', () => {
  let adminJwt: string;

  beforeEach(async () => {
    await resetDb();
    await createSettings(); // schoolDays Mon-Fri, start 08:00, grace 5
    await createAdmin();
    adminJwt = await loginAdmin();
    await createStudentDirect({ studentId: 'STU001', firstName: 'Mei', lastName: 'Chan', class: '7A', form: 'Form 2' });
    await createStudentDirect({ studentId: 'STU002', firstName: 'Kai', lastName: 'Wong', class: '7A', form: 'Form 2' });
    await createStudentDirect({ studentId: 'STU003', firstName: 'Ling', lastName: 'Ho', class: '7B', form: 'Form 2' });
    freezeAt('2026-03-03T01:00:00.000Z'); // 09:00 Asia/Hong_Kong
  });

  afterEach(() => {
    resetTestClock();
  });

  it('synthesizes ABSENT rows for active students on a school day', async () => {
    const response = await request
      .get(`/api/attendance?date=${DATE}`)
      .set(authHeader(adminJwt));

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      page: 1,
      pageSize: 20,
      total: 3,
      totalPages: 1,
      summary: {
        totalStudents: 3,
        present: 0,
        late: 0,
        absent: 3,
        checkedOut: 0,
        checkInRate: 0,
      },
    });
    const items = response.body.data.items as Array<Record<string, unknown>>;
    expect(items.every((item) => item.status === 'ABSENT')).toBe(true);
    expect(items.map((item) => item.id)).toContain(`absent:STU001:${DATE}`);
    expect(items[0]).toMatchObject({
      fullName: expect.any(String),
      date: DATE,
      checkInAt: null,
      checkOutAt: null,
      checkedOut: false,
    });
  });

  it('PUT /attendance/:studentId/:date upserts a MANUAL row', async () => {
    const put = await request
      .put(`/api/attendance/STU001/${DATE}`)
      .set(authHeader(adminJwt))
      .send({ status: 'PRESENT', checkInAt: `${DATE}T08:00:00+08:00`, note: 'Manual correction' });

    expect(put.status).toBe(200);
    expect(put.body.data).toMatchObject({
      studentId: 'STU001',
      date: DATE,
      status: 'PRESENT',
      lateMinutes: 0,
      method: 'MANUAL',
      note: 'Manual correction',
      checkInAt: `${DATE}T08:00:00+08:00`,
      checkedOut: false,
    });
    expect(put.body.data.id).toMatch(/^\d+$/);

    const list = await request.get(`/api/attendance?date=${DATE}`).set(authHeader(adminJwt));
    expect(list.body.data.summary).toMatchObject({ present: 1, absent: 2, totalStudents: 3 });
    expect(list.body.data.total).toBe(3);
  });

  it('PUT with status LATE recomputes lateMinutes from settings', async () => {
    const put = await request
      .put(`/api/attendance/STU002/${DATE}`)
      .set(authHeader(adminJwt))
      .send({ status: 'LATE', checkInAt: `${DATE}T08:10:00+08:00` });

    expect(put.status).toBe(200);
    // 08:10 is 5 minutes past 08:00+5min grace.
    expect(put.body.data).toMatchObject({ status: 'LATE', lateMinutes: 5 });
  });

  it('PATCH /attendance/:id supports a checkInAt-only update (E2E checkout flow)', async () => {
    const put = await request
      .put(`/api/attendance/STU003/${DATE}`)
      .set(authHeader(adminJwt))
      .send({ status: 'PRESENT', checkInAt: `${DATE}T08:01:00+08:00` });
    const id = put.body.data.id as string;

    const patch = await request
      .patch(`/api/attendance/${id}`)
      .set(authHeader(adminJwt))
      .send({ checkInAt: `${DATE}T07:45:00+08:00` });

    expect(patch.status).toBe(200);
    expect(patch.body.data.checkInAt).toBe(`${DATE}T07:45:00+08:00`);
    expect(patch.body.data.status).toBe('PRESENT');

    const row = await prisma.attendance.findUniqueOrThrow({ where: { id: BigInt(id) } });
    // 2026-03-03T07:45:00+08:00 == 2026-03-02T23:45:00Z
    expect(row.checkInAt?.toISOString()).toBe('2026-03-02T23:45:00.000Z');
    expect(row.method).toBe('MANUAL');
  });

  it('PATCH status=ABSENT deletes the stored row', async () => {
    const put = await request
      .put(`/api/attendance/STU001/${DATE}`)
      .set(authHeader(adminJwt))
      .send({ status: 'PRESENT', checkInAt: `${DATE}T08:01:00+08:00` });
    const id = put.body.data.id as string;

    const patch = await request
      .patch(`/api/attendance/${id}`)
      .set(authHeader(adminJwt))
      .send({ status: 'ABSENT' });

    expect(patch.status).toBe(200);
    expect(patch.body.data).toMatchObject({ status: 'ABSENT', studentId: 'STU001', date: DATE });
    expect(await prisma.attendance.count()).toBe(0);

    const list = await request.get(`/api/attendance?date=${DATE}`).set(authHeader(adminJwt));
    expect(list.body.data.summary.absent).toBe(3);
  });

  it('PUT status=ABSENT deletes the row and returns the absent shape', async () => {
    await request
      .put(`/api/attendance/STU001/${DATE}`)
      .set(authHeader(adminJwt))
      .send({ status: 'PRESENT' });
    expect(await prisma.attendance.count()).toBe(1);

    const put = await request
      .put(`/api/attendance/STU001/${DATE}`)
      .set(authHeader(adminJwt))
      .send({ status: 'ABSENT' });

    expect(put.status).toBe(200);
    expect(put.body.data).toMatchObject({
      studentId: 'STU001',
      date: DATE,
      status: 'ABSENT',
      checkInAt: null,
      checkOutAt: null,
    });
    expect(await prisma.attendance.count()).toBe(0);
  });

  it('supports PATCH on synthesized absent ids', async () => {
    const patch = await request
      .patch(`/api/attendance/absent:STU001:${DATE}`)
      .set(authHeader(adminJwt))
      .send({ status: 'PRESENT', checkInAt: `${DATE}T08:00:00+08:00` });

    expect(patch.status).toBe(200);
    expect(patch.body.data).toMatchObject({ studentId: 'STU001', status: 'PRESENT', method: 'MANUAL' });
    expect(await prisma.attendance.count()).toBe(1);
  });

  it('validates correction input and 404s unknown records', async () => {
    const badDate = await request
      .put('/api/attendance/STU001/2026-02-30')
      .set(authHeader(adminJwt))
      .send({ status: 'PRESENT' });
    expect(badDate.status).toBe(400);

    const unknownStudent = await request
      .put('/api/attendance/STU999/2026-03-03')
      .set(authHeader(adminJwt))
      .send({ status: 'PRESENT' });
    expect(unknownStudent.status).toBe(404);

    const unknownId = await request
      .patch('/api/attendance/999999')
      .set(authHeader(adminJwt))
      .send({ status: 'PRESENT' });
    expect(unknownId.status).toBe(404);

    const badOrder = await request
      .put(`/api/attendance/STU001/${DATE}`)
      .set(authHeader(adminJwt))
      .send({
        status: 'PRESENT',
        checkInAt: `${DATE}T09:00:00+08:00`,
        checkOutAt: `${DATE}T08:00:00+08:00`,
      });
    expect(badOrder.status).toBe(400);
    expect(badOrder.body.error.code).toBe('VALIDATION_ERROR');

    const syntheticWithoutStatus = await request
      .patch(`/api/attendance/absent:STU001:${DATE}`)
      .set(authHeader(adminJwt))
      .send({ note: 'hello' });
    expect(syntheticWithoutStatus.status).toBe(400);
  });

  it('filters by class/status and paginates', async () => {
    await request
      .put(`/api/attendance/STU001/${DATE}`)
      .set(authHeader(adminJwt))
      .send({ status: 'PRESENT', checkInAt: `${DATE}T08:01:00+08:00` });
    await request
      .put(`/api/attendance/STU002/${DATE}`)
      .set(authHeader(adminJwt))
      .send({ status: 'LATE', checkInAt: `${DATE}T08:10:00+08:00` });

    const byClass = await request
      .get(`/api/attendance?date=${DATE}&class=7A`)
      .set(authHeader(adminJwt));
    expect(byClass.body.data.summary.totalStudents).toBe(2);
    expect(byClass.body.data.items.every((item: { class: string }) => item.class === '7A')).toBe(true);

    const onlyLate = await request
      .get(`/api/attendance?date=${DATE}&status=LATE`)
      .set(authHeader(adminJwt));
    expect(onlyLate.body.data.items).toHaveLength(1);
    expect(onlyLate.body.data.items[0]).toMatchObject({ studentId: 'STU002', lateMinutes: 5 });
    // Summary is computed before the status filter.
    expect(onlyLate.body.data.summary).toMatchObject({ present: 1, late: 1, absent: 1 });

    const paged = await request
      .get(`/api/attendance?date=${DATE}&page=2&pageSize=2`)
      .set(authHeader(adminJwt));
    expect(paged.body.data).toMatchObject({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
    expect(paged.body.data.items).toHaveLength(1);
  });

  it('does not synthesize absences on non-school days but shows stored rows', async () => {
    const saturday = '2026-03-07';
    const list = await request
      .get(`/api/attendance?date=${saturday}`)
      .set(authHeader(adminJwt));
    expect(list.body.data.total).toBe(0);
    expect(list.body.data.summary.absent).toBe(0);

    await request
      .put(`/api/attendance/STU001/${saturday}`)
      .set(authHeader(adminJwt))
      .send({ status: 'PRESENT', checkInAt: `${saturday}T09:00:00+08:00` });
    const withRow = await request
      .get(`/api/attendance?date=${saturday}`)
      .set(authHeader(adminJwt));
    expect(withRow.body.data.total).toBe(1);
    expect(withRow.body.data.items[0].studentId).toBe('STU001');
  });

  it('serves /attendance/today and a CSV export', async () => {
    await request
      .put(`/api/attendance/STU001/${DATE}`)
      .set(authHeader(adminJwt))
      .send({ status: 'LATE', checkInAt: `${DATE}T08:10:00+08:00`, note: 'Late, "traffic"' });

    const today = await request.get('/api/attendance/today').set(authHeader(adminJwt));
    expect(today.status).toBe(200);
    expect(today.body.data.items[0].date).toBe(DATE);

    const csv = await request
      .get(`/api/attendance/export?from=${DATE}&to=${DATE}`)
      .set(authHeader(adminJwt));
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.headers['content-disposition']).toContain('attachment');
    const lines = (csv.text as string).split('\r\n');
    expect(lines[0]).toBe(
      'student_id,full_name,class,form,date,check_in,check_out,status,late_minutes,method,note',
    );
    expect(lines).toHaveLength(4); // header + 3 students
    expect(csv.text).toContain('STU001');
    expect(csv.text).toContain('"Late, ""traffic"""');
    expect(csv.text).toContain(',ABSENT,');

    const filtered = await request
      .get(`/api/attendance/export?from=${DATE}&to=${DATE}&status=LATE`)
      .set(authHeader(adminJwt));
    expect((filtered.text as string).split('\r\n')).toHaveLength(2);
  });

  it('does not synthesize absences before a student enrolled', async () => {
    // STU001/STU002/STU003 were created 2026-01-01 by the fixture setup.
    // STU100 enrolls on the frozen "today" (2026-03-03).
    await createStudentDirect({
      studentId: 'STU100',
      firstName: 'New',
      lastName: 'Pupil',
      class: '7A',
      createdAt: '2026-03-03T02:00:00.000Z',
    });

    // Yesterday: only the historical students are (rightly) absent.
    const yesterdayForNew = await request
      .get('/api/attendance?date=2026-03-02&studentId=STU100')
      .set(authHeader(adminJwt));
    expect(yesterdayForNew.body.data.total).toBe(0);
    expect(yesterdayForNew.body.data.summary.absent).toBe(0);

    const yesterdayForOld = await request
      .get('/api/attendance?date=2026-03-02&studentId=STU001')
      .set(authHeader(adminJwt));
    expect(yesterdayForOld.body.data.total).toBe(1);
    expect(yesterdayForOld.body.data.items[0].status).toBe('ABSENT');

    // Range view: the new student appears only from the enrollment date.
    const range = await request
      .get('/api/attendance?from=2026-03-02&to=2026-03-03&class=7A')
      .set(authHeader(adminJwt));
    const items = range.body.data.items as Array<{ studentId: string; date: string }>;
    expect(items.some((item) => item.studentId === 'STU100' && item.date === '2026-03-02')).toBe(
      false,
    );
    expect(items.some((item) => item.studentId === 'STU100' && item.date === '2026-03-03')).toBe(
      true,
    );
    expect(range.body.data.summary).toMatchObject({
      totalStudents: 3,
      absent: 5, // 2 historical students x 2 days + new student x 1 day
    });

    // Student portal path (GET /api/student/attendance) has no pre-enrollment rows.
    const token = await studentToken('STU100');
    const portal = await request
      .get('/api/student/attendance?from=2026-03-01&to=2026-03-03')
      .set(authHeader(token));
    expect(portal.status).toBe(200);
    const portalDates = (portal.body.data.items as Array<{ date: string }>).map((item) => item.date);
    expect(portalDates).toEqual(['2026-03-03']);
    expect(portal.body.data.summary).toMatchObject({ present: 0, late: 0, absent: 1 });

    // CSV export follows the same rule.
    const csv = await request
      .get('/api/attendance/export?from=2026-03-02&to=2026-03-03&class=7A')
      .set(authHeader(adminJwt));
    const newStudentLines = (csv.text as string)
      .split('\r\n')
      .filter((line) => line.startsWith('STU100,'));
    expect(newStudentLines).toHaveLength(1);
    expect(newStudentLines[0]).toContain('2026-03-03');
  });

  it('reports only count school days since each student enrolled', async () => {
    await createStudentDirect({
      studentId: 'STU100',
      firstName: 'New',
      lastName: 'Pupil',
      class: '7A',
      createdAt: '2026-03-03T02:00:00.000Z',
    });

    const report = await request
      .get('/api/reports/summary?from=2026-03-02&to=2026-03-03&class=7A')
      .set(authHeader(adminJwt));

    expect(report.status).toBe(200);
    expect(report.body.data.totals).toMatchObject({
      studentDays: 5, // 2 historical students x 2 days + new student x 1 day
      present: 0,
      late: 0,
      absent: 5,
      attendanceRate: 0,
    });
    expect(report.body.data.days).toEqual([
      { date: '2026-03-02', present: 0, late: 0, absent: 2, total: 2 },
      { date: '2026-03-03', present: 0, late: 0, absent: 3, total: 3 },
    ]);
    const newStudent = (
      report.body.data.students as Array<{ studentId: string; absent: number }>
    ).find((student) => student.studentId === 'STU100');
    expect(newStudent?.absent).toBe(1);
  });

  it('serves a student their own attendance with a summary', async () => {
    await request
      .put(`/api/attendance/STU001/${DATE}`)
      .set(authHeader(adminJwt))
      .send({ status: 'PRESENT', checkInAt: `${DATE}T08:02:00+08:00`, checkOutAt: `${DATE}T15:00:00+08:00` });

    const token = await studentToken('STU001');
    const response = await request
      .get(`/api/student/attendance?from=${DATE}&to=${DATE}`)
      .set(authHeader(token));

    expect(response.status).toBe(200);
    expect(response.body.data.summary).toMatchObject({
      present: 1,
      late: 0,
      absent: 0,
      checkedOut: 1,
    });
    expect(response.body.data.items[0]).toMatchObject({
      studentId: 'STU001',
      date: DATE,
      checkedOut: true,
      checkOutAt: `${DATE}T15:00:00+08:00`,
    });
  });
});
