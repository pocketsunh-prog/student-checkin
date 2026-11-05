import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import {
  authHeader,
  backdateStudent,
  createAdmin,
  createSettings,
  createStudentDirect,
  fakePng,
  freezeAt,
  loginAdmin,
  registerStudent,
  request,
  resetDb,
  resetTestClock,
  studentToken,
} from './helpers';

const STUDENT_FIELDS: Record<string, string> = {
  firstName: 'Mei',
  lastName: 'Chan',
  dob: '2011-04-19',
  sex: 'FEMALE',
  class: '7A',
  form: 'Form 2',
};

async function createStudentAsAdmin(
  adminJwt: string,
  studentId: string,
  options: { faceMarker?: string; password?: string; fields?: Record<string, string> } = {},
) {
  const req = request.post('/api/students').set(authHeader(adminJwt));
  const fields = { studentId, ...STUDENT_FIELDS, ...(options.fields ?? {}) };
  for (const [key, value] of Object.entries(fields)) req.field(key, value);
  if (options.password) req.field('password', options.password);
  if (options.faceMarker) {
    req.attach('faceImage', fakePng(options.faceMarker), {
      filename: 'face.png',
      contentType: 'image/png',
    });
  }
  return req;
}

describe('Admin student management', () => {
  let adminJwt: string;

  beforeEach(async () => {
    await resetDb();
    await createSettings();
    await createAdmin();
    adminJwt = await loginAdmin();
  });

  afterEach(() => {
    resetTestClock();
  });

  it('creates a student without a face and returns the initial password', async () => {
    const response = await createStudentAsAdmin(adminJwt, 'STU1001');

    expect(response.status).toBe(201);
    expect(response.body.data.student).toMatchObject({
      studentId: 'STU1001',
      fullName: 'Mei Chan',
      faceEnrolled: false,
      status: 'ACTIVE',
      photoUrl: null,
    });
    expect(response.body.data.initialPassword).toBe('Student@12345');
    expect(JSON.stringify(response.body)).not.toContain('faceDescriptor');

    const login = await request
      .post('/api/auth/student/login')
      .send({ studentId: 'STU1001', password: 'Student@12345' });
    expect(login.status).toBe(200);
  });

  it('creates a student with an enrolled face and serves the photo', async () => {
    const response = await createStudentAsAdmin(adminJwt, 'STU1002', { faceMarker: 'face-admin' });

    expect(response.status).toBe(201);
    expect(response.body.data.student.faceEnrolled).toBe(true);
    expect(response.body.data.student.photoUrl).toBe('/api/students/STU1002/photo');
    expect(response.body.data.initialPassword).toBe('Student@12345');

    const photo = await request
      .get('/api/students/STU1002/photo')
      .set(authHeader(adminJwt));
    expect(photo.status).toBe(200);
    expect(photo.headers['content-type']).toContain('image/png');
  });

  it('honours an explicit password and rejects duplicates/duplicate faces', async () => {
    const withPassword = await createStudentAsAdmin(adminJwt, 'STU1003', {
      password: 'CustomPassword@1',
    });
    expect(withPassword.status).toBe(201);
    expect(withPassword.body.data.initialPassword).toBeUndefined();

    const duplicate = await createStudentAsAdmin(adminJwt, 'STU1003');
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('CONFLICT');

    await createStudentAsAdmin(adminJwt, 'STU1004', { faceMarker: 'same-face' });
    const duplicateFace = await createStudentAsAdmin(adminJwt, 'STU1005', {
      faceMarker: 'same-face',
    });
    expect(duplicateFace.status).toBe(409);
    expect(duplicateFace.body.error.code).toBe('FACE_ALREADY_ENROLLED');
  });

  it('lists, filters, searches, sorts and paginates students', async () => {
    await createStudentAsAdmin(adminJwt, 'STU2001', {
      faceMarker: 'face-a',
      fields: { firstName: 'Alice', lastName: 'Chan', class: '7A' },
    });
    await createStudentAsAdmin(adminJwt, 'STU2002', {
      fields: { firstName: 'Bob', lastName: 'Wong', class: '7B' },
    });
    await createStudentAsAdmin(adminJwt, 'STU2003', {
      fields: { firstName: 'Cara', lastName: 'Lee', class: '7B' },
    });

    const all = await request.get('/api/students').set(authHeader(adminJwt));
    expect(all.body.data).toMatchObject({ total: 3, page: 1, pageSize: 20, totalPages: 1 });
    expect(all.body.data.items).toHaveLength(3);

    const search = await request
      .get('/api/students?search=alice')
      .set(authHeader(adminJwt));
    expect(search.body.data.total).toBe(1);
    expect(search.body.data.items[0].studentId).toBe('STU2001');

    const byClass = await request
      .get('/api/students?class=7B')
      .set(authHeader(adminJwt));
    expect(byClass.body.data.total).toBe(2);

    const enrolled = await request
      .get('/api/students?faceEnrolled=true')
      .set(authHeader(adminJwt));
    expect(enrolled.body.data.total).toBe(1);

    const notEnrolled = await request
      .get('/api/students?faceEnrolled=false')
      .set(authHeader(adminJwt));
    expect(notEnrolled.body.data.total).toBe(2);

    const paged = await request
      .get('/api/students?page=2&pageSize=2')
      .set(authHeader(adminJwt));
    expect(paged.body.data).toMatchObject({ page: 2, pageSize: 2, total: 3, totalPages: 2 });
    expect(paged.body.data.items).toHaveLength(1);

    const nameSorted = await request
      .get('/api/students?sort=name')
      .set(authHeader(adminJwt));
    expect((nameSorted.body.data.items as Array<{ lastName: string }>)[0]!.lastName).toBe('Chan');

    const meta = await request
      .get('/api/students/meta/options')
      .set(authHeader(adminJwt));
    expect(meta.body.data).toEqual({ classes: ['7A', '7B'], forms: ['Form 2'] });
  });

  it('returns a student detail with recent attendance and todayStatus', async () => {
    freezeAt('2026-03-03T01:00:00.000Z'); // 09:00 HK, Tuesday
    await createStudentAsAdmin(adminJwt, 'STU1001');
    // API creation uses the DB clock; backdate so the frozen school day has
    // already been reached for absence synthesis.
    await backdateStudent('STU1001');

    const detail = await request
      .get('/api/students/STU1001')
      .set(authHeader(adminJwt));
    expect(detail.status).toBe(200);
    expect(detail.body.data.student.todayStatus).toBe('ABSENT');
    expect(detail.body.data.recentAttendance).toEqual([]);

    await prisma.attendance.create({
      data: {
        studentId: 'STU1001',
        date: new Date('2026-03-03T00:00:00.000Z'),
        checkInAt: new Date('2026-03-03T00:02:00.000Z'),
        status: 'PRESENT',
      },
    });
    const withAttendance = await request
      .get('/api/students/STU1001')
      .set(authHeader(adminJwt));
    expect(withAttendance.body.data.student.todayStatus).toBe('PRESENT');
    expect(withAttendance.body.data.recentAttendance).toHaveLength(1);

    const list = await request.get('/api/students').set(authHeader(adminJwt));
    expect(list.body.data.items[0].todayStatus).toBe('PRESENT');
  });

  it('patches and soft-deletes students', async () => {
    await createStudentAsAdmin(adminJwt, 'STU1001');

    const patch = await request
      .patch('/api/students/STU1001')
      .set(authHeader(adminJwt))
      .send({ firstName: 'Mei-Ling', class: '7C', status: 'ACTIVE' });
    expect(patch.status).toBe(200);
    expect(patch.body.data).toMatchObject({ firstName: 'Mei-Ling', class: '7C' });

    const invalid = await request
      .patch('/api/students/STU1001')
      .set(authHeader(adminJwt))
      .send({ sex: 'UNKNOWN' });
    expect(invalid.status).toBe(400);

    const missing = await request
      .patch('/api/students/NOPE')
      .set(authHeader(adminJwt))
      .send({ firstName: 'X' });
    expect(missing.status).toBe(404);

    const remove = await request
      .delete('/api/students/STU1001')
      .set(authHeader(adminJwt));
    expect(remove.status).toBe(200);
    expect(remove.body.data).toEqual({ studentId: 'STU1001', status: 'INACTIVE' });

    const defaultList = await request.get('/api/students').set(authHeader(adminJwt));
    expect(defaultList.body.data.total).toBe(0);

    const allList = await request
      .get('/api/students?status=ALL')
      .set(authHeader(adminJwt));
    expect(allList.body.data.total).toBe(1);
    expect(allList.body.data.items[0].status).toBe('INACTIVE');
  });

  it('resets passwords and lets the student log in with the temporary one', async () => {
    await createStudentAsAdmin(adminJwt, 'STU1001');

    const reset = await request
      .post('/api/students/STU1001/reset-password')
      .set(authHeader(adminJwt))
      .send({});
    expect(reset.status).toBe(200);
    expect(reset.body.data.studentId).toBe('STU1001');
    const temporaryPassword = reset.body.data.temporaryPassword as string;
    expect(temporaryPassword.length).toBeGreaterThanOrEqual(8);

    const login = await request
      .post('/api/auth/student/login')
      .send({ studentId: 'STU1001', password: temporaryPassword });
    expect(login.status).toBe(200);

    const explicit = await request
      .post('/api/students/STU1001/reset-password')
      .set(authHeader(adminJwt))
      .send({ newPassword: 'ChosenPassword@1' });
    expect(explicit.body.data.temporaryPassword).toBe('ChosenPassword@1');

    const explicitLogin = await request
      .post('/api/auth/student/login')
      .send({ studentId: 'STU1001', password: 'ChosenPassword@1' });
    expect(explicitLogin.status).toBe(200);
  });

  it('enrolls a face for an existing student and enforces the duplicate guard', async () => {
    await createStudentAsAdmin(adminJwt, 'STU1001');
    await createStudentAsAdmin(adminJwt, 'STU1002');

    const enroll = await request
      .post('/api/students/STU1001/face')
      .set(authHeader(adminJwt))
      .attach('faceImage', fakePng('re-enroll-face'), {
        filename: 'face.png',
        contentType: 'image/png',
      });
    expect(enroll.status).toBe(200);
    expect(enroll.body.data).toMatchObject({ faceEnrolled: true });
    expect(enroll.body.data.student.photoUrl).toBe('/api/students/STU1001/photo');

    const duplicate = await request
      .post('/api/students/STU1002/face')
      .set(authHeader(adminJwt))
      .attach('faceImage', fakePng('re-enroll-face'), {
        filename: 'face.png',
        contentType: 'image/png',
      });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('FACE_ALREADY_ENROLLED');

    const missingFile = await request
      .post('/api/students/STU1002/face')
      .set(authHeader(adminJwt));
    expect(missingFile.status).toBe(400);
  });

  it('protects photos: admin yes, self yes, other student forbidden, anonymous 401', async () => {
    await registerStudent({ studentId: 'STU1001', faceMarker: 'photo-face-1' });
    await registerStudent({ studentId: 'STU1002', faceMarker: 'photo-face-2' });

    const ownToken = await studentToken('STU1001');
    const otherToken = await studentToken('STU1002');

    const own = await request.get('/api/students/STU1001/photo').set(authHeader(ownToken));
    expect(own.status).toBe(200);

    const other = await request.get('/api/students/STU1001/photo').set(authHeader(otherToken));
    expect(other.status).toBe(403);

    const anonymous = await request.get('/api/students/STU1001/photo');
    expect(anonymous.status).toBe(401);
  });

  it('supports student self-service face re-enrollment', async () => {
    await registerStudent({ studentId: 'STU1001', faceMarker: 'self-face-1' });
    const token = await studentToken('STU1001');

    const reEnroll = await request
      .post('/api/student/enroll-face')
      .set(authHeader(token))
      .attach('faceImage', fakePng('self-face-2'), {
        filename: 'face.png',
        contentType: 'image/png',
      });
    expect(reEnroll.status).toBe(200);
    expect(reEnroll.body.data.faceEnrolled).toBe(true);
    expect(typeof reEnroll.body.data.enrolledAt).toBe('string');

    const profile = await request.get('/api/student/profile').set(authHeader(token));
    expect(profile.body.data.faceEnrolled).toBe(true);
    expect(profile.body.data.photoUrl).toBe('/api/students/STU1001/photo');

    const badImage = await request
      .post('/api/student/enroll-face')
      .set(authHeader(token))
      .attach('faceImage', Buffer.from('nope'), { filename: 'x.jpg', contentType: 'image/jpeg' });
    expect(badImage.status).toBe(422);
  });

  it('scopes admin endpoints to admins', async () => {
    await registerStudent();
    const studentJwt = await studentToken();

    for (const path of ['/api/students', '/api/devices', '/api/settings', '/api/reports/summary?from=2026-03-01&to=2026-03-02']) {
      const response = await request.get(path).set(authHeader(studentJwt));
      expect(response.status).toBe(403);
    }
  });
});
