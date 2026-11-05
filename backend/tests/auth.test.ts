import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import {
  DEFAULT_ADMIN,
  DEFAULT_STUDENT,
  authHeader,
  createAdmin,
  createSettings,
  fakePng,
  loginAdmin,
  registerStudent,
  request,
  resetDb,
  resetTestClock,
  studentToken,
} from './helpers';

describe('Auth & student self-registration', () => {
  beforeEach(async () => {
    await resetDb();
    await createSettings();
    await createAdmin();
  });

  afterEach(() => {
    resetTestClock();
  });

  it('logs an admin in and resolves /auth/me', async () => {
    const response = await request
      .post('/api/auth/admin/login')
      .send({ email: DEFAULT_ADMIN.email, password: DEFAULT_ADMIN.password });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: {
        user: {
          id: expect.any(String),
          email: DEFAULT_ADMIN.email,
          name: DEFAULT_ADMIN.name,
          role: 'SUPER_ADMIN',
        },
      },
    });
    expect(typeof response.body.data.token).toBe('string');

    const me = await request.get('/api/auth/me').set(authHeader(response.body.data.token));
    expect(me.status).toBe(200);
    expect(me.body.data.actorType).toBe('admin');
    expect(me.body.data.user.email).toBe(DEFAULT_ADMIN.email);
  });

  it('rejects bad admin credentials with 401 UNAUTHORIZED', async () => {
    const response = await request
      .post('/api/auth/admin/login')
      .send({ email: DEFAULT_ADMIN.email, password: 'wrong-password' });
    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'UNAUTHORIZED' },
    });
  });

  it('registers a student, stores the descriptor, and never exposes it', async () => {
    const response = await registerStudent();

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.student).toMatchObject({
      studentId: DEFAULT_STUDENT.studentId,
      firstName: 'Mei',
      lastName: 'Chan',
      fullName: 'Mei Chan',
      dob: '2011-04-19',
      sex: 'FEMALE',
      class: '7A',
      form: 'Form 2',
      faceEnrolled: true,
      photoUrl: `/api/students/${DEFAULT_STUDENT.studentId}/photo`,
    });
    expect(typeof response.body.data.token).toBe('string');
    expect(JSON.stringify(response.body)).not.toContain('faceDescriptor');
    expect(JSON.stringify(response.body)).not.toContain('descriptor');

    const row = await prisma.student.findUniqueOrThrow({
      where: { studentId: DEFAULT_STUDENT.studentId },
    });
    expect(Array.isArray(row.faceDescriptor)).toBe(true);
    expect((row.faceDescriptor as number[]).length).toBe(1024);
    expect(row.faceDescriptorHash).toMatch(/^[a-f0-9]{64}$/);
    expect(row.photoPath).toMatch(/^faces\//);

    const photo = await request
      .get(`/api/students/${DEFAULT_STUDENT.studentId}/photo`)
      .set(authHeader(response.body.data.token));
    expect(photo.status).toBe(200);
    expect(photo.headers['content-type']).toContain('image/png');
    expect(photo.headers['cache-control']).toBe('private, max-age=300');
  });

  it('rejects a duplicate student id with 409 CONFLICT', async () => {
    const first = await registerStudent();
    expect(first.status).toBe(201);

    const duplicate = await registerStudent({ faceMarker: 'another-face' });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('CONFLICT');
  });

  it('rejects a duplicate face with 409 FACE_ALREADY_ENROLLED', async () => {
    const first = await registerStudent({ studentId: 'STU2001', faceMarker: 'shared-face' });
    expect(first.status).toBe(201);

    const duplicate = await registerStudent({ studentId: 'STU2002', faceMarker: 'shared-face' });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe('FACE_ALREADY_ENROLLED');
    expect(await prisma.student.count({ where: { studentId: 'STU2002' } })).toBe(0);
  });

  it('validates registration input and image uploads', async () => {
    const missingFace = await request
      .post('/api/auth/student/register')
      .field('studentId', 'STU3001')
      .field('firstName', 'Mei')
      .field('lastName', 'Chan')
      .field('dob', '2011-04-19')
      .field('sex', 'FEMALE')
      .field('class', '7A')
      .field('form', 'Form 2')
      .field('password', 'Student@12345');
    expect(missingFace.status).toBe(400);
    expect(missingFace.body.error.code).toBe('VALIDATION_ERROR');

    const badImage = await request
      .post('/api/auth/student/register')
      .field('studentId', 'STU3002')
      .field('firstName', 'Mei')
      .field('lastName', 'Chan')
      .field('dob', '2011-04-19')
      .field('sex', 'FEMALE')
      .field('class', '7A')
      .field('form', 'Form 2')
      .field('password', 'Student@12345')
      .attach('faceImage', Buffer.from('definitely-not-an-image'), {
        filename: 'bad.jpg',
        contentType: 'image/jpeg',
      });
    expect(badImage.status).toBe(422);
    expect(badImage.body.error.code).toBe('FACE_NOT_DETECTED');

    const futureDob = await registerStudent({ dob: '2999-01-01' });
    expect(futureDob.status).toBe(400);
    expect(futureDob.body.error.code).toBe('VALIDATION_ERROR');

    const badStudentId = await registerStudent({ studentId: 'no spaces allowed' });
    expect(badStudentId.status).toBe(400);
  });

  it('logs a student in, returns /auth/me, and changes the password', async () => {
    await registerStudent();
    const token = await studentToken();

    const login = await request
      .post('/api/auth/student/login')
      .send({ studentId: DEFAULT_STUDENT.studentId, password: DEFAULT_STUDENT.password });
    expect(login.status).toBe(200);
    expect(login.body.data.student.studentId).toBe(DEFAULT_STUDENT.studentId);

    const me = await request.get('/api/auth/me').set(authHeader(token));
    expect(me.status).toBe(200);
    expect(me.body.data.actorType).toBe('student');
    expect(me.body.data.user.studentId).toBe(DEFAULT_STUDENT.studentId);

    const change = await request
      .post('/api/auth/student/change-password')
      .set(authHeader(token))
      .send({ currentPassword: DEFAULT_STUDENT.password, newPassword: 'BrandNew@123' });
    expect(change.status).toBe(200);

    const oldLogin = await request
      .post('/api/auth/student/login')
      .send({ studentId: DEFAULT_STUDENT.studentId, password: DEFAULT_STUDENT.password });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request
      .post('/api/auth/student/login')
      .send({ studentId: DEFAULT_STUDENT.studentId, password: 'BrandNew@123' });
    expect(newLogin.status).toBe(200);

    const wrongCurrent = await request
      .post('/api/auth/student/change-password')
      .set(authHeader(token))
      .send({ currentPassword: 'not-the-password', newPassword: 'Another@1234' });
    expect(wrongCurrent.status).toBe(401);
  });

  it('enforces roles and token validity', async () => {
    await registerStudent();
    const studentJwt = await studentToken();
    const adminJwt = await loginAdmin();

    const adminEndpoint = await request.get('/api/students').set(authHeader(studentJwt));
    expect(adminEndpoint.status).toBe(403);
    expect(adminEndpoint.body.error.code).toBe('FORBIDDEN');

    const studentEndpoint = await request.get('/api/student/profile').set(authHeader(adminJwt));
    expect(studentEndpoint.status).toBe(403);

    const anonymous = await request.get('/api/students');
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error.code).toBe('UNAUTHORIZED');

    const invalid = await request.get('/api/auth/me').set(authHeader('not-a-jwt'));
    expect(invalid.status).toBe(401);

    const profile = await request.get('/api/student/profile').set(authHeader(studentJwt));
    expect(profile.status).toBe(200);
    expect(profile.body.data.studentId).toBe(DEFAULT_STUDENT.studentId);
    expect(JSON.stringify(profile.body)).not.toContain('faceDescriptor');
  });

  it('rejects an inactive student login', async () => {
    await registerStudent();
    await prisma.student.update({
      where: { studentId: DEFAULT_STUDENT.studentId },
      data: { status: 'INACTIVE' },
    });
    const login = await request
      .post('/api/auth/student/login')
      .send({ studentId: DEFAULT_STUDENT.studentId, password: DEFAULT_STUDENT.password });
    expect(login.status).toBe(401);
  });

  it('serves no photo for an unenrolled student', async () => {
    await prisma.student.create({
      data: {
        studentId: 'STU9999',
        firstName: 'No',
        lastName: 'Photo',
        dob: new Date('2011-01-01T00:00:00.000Z'),
        sex: 'MALE',
        class: '7A',
        form: 'Form 2',
        passwordHash: 'x',
      },
    });
    const adminJwt = await loginAdmin();
    const photo = await request.get('/api/students/STU9999/photo').set(authHeader(adminJwt));
    expect(photo.status).toBe(404);
    expect(photo.body.error.code).toBe('NOT_FOUND');
  });

  it('never returns descriptors from admin student endpoints', async () => {
    await registerStudent();
    const adminJwt = await loginAdmin();
    const list = await request.get('/api/students').set(authHeader(adminJwt));
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).not.toContain('faceDescriptor');

    const detail = await request
      .get(`/api/students/${DEFAULT_STUDENT.studentId}`)
      .set(authHeader(adminJwt));
    expect(detail.status).toBe(200);
    expect(JSON.stringify(detail.body)).not.toContain('descriptor');
    expect(detail.body.data.student.faceEnrolled).toBe(true);
  });
});
