import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import {
  deviceHeader,
  freezeAt,
  kioskVerify,
  createAdmin,
  createDevice,
  createSettings,
  loginAdmin,
  registerStudent,
  request,
  resetDb,
  resetTestClock,
  scanEventCount,
  type TestDevice,
} from './helpers';

const STUDENT_ID = 'STU1001';
const SCAN_DATE = '2026-03-03';

describe('Kiosk verify — attendance state machine', () => {
  let device: TestDevice;

  beforeEach(async () => {
    await resetDb();
    await createSettings(); // dayStartTime 08:00, grace 5 => late threshold 08:05
    await createAdmin();
    device = await createDevice();
    const registered = await registerStudent({ faceMarker: 'face-a' });
    expect(registered.status).toBe(201);
    freezeAt('2026-03-03T00:03:00.000Z'); // 08:03 Asia/Hong_Kong
  });

  afterEach(() => {
    resetTestClock();
  });

  it('checks in, enforces the 60s duplicate guard, then checks out', async () => {
    const first = await kioskVerify(device.apiKey, 'face-a');
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({
      matched: true,
      action: 'CHECK_IN',
      confidence: 1,
      student: {
        studentId: STUDENT_ID,
        fullName: 'Mei Chan',
        class: '7A',
        form: 'Form 2',
        photoUrl: `/api/students/${STUDENT_ID}/photo`,
      },
      attendance: { date: SCAN_DATE, status: 'PRESENT', lateMinutes: 0, checkOutAt: null },
    });
    expect(first.body.data.message).toBe('Checked in');

    const second = await kioskVerify(device.apiKey, 'face-a');
    expect(second.body.data.action).toBe('ALREADY_CHECKED_IN');
    expect(await prisma.attendance.count()).toBe(1);

    // Exactly at the 60s boundary the scan still counts as a duplicate.
    freezeAt('2026-03-03T00:04:00.000Z');
    const boundary = await kioskVerify(device.apiKey, 'face-a');
    expect(boundary.body.data.action).toBe('ALREADY_CHECKED_IN');

    freezeAt('2026-03-03T00:04:01.000Z'); // 61s after check-in
    const checkout = await kioskVerify(device.apiKey, 'face-a');
    expect(checkout.body.data.action).toBe('CHECK_OUT');
    expect(checkout.body.data.attendance.checkOutAt).toBeTruthy();

    const fourth = await kioskVerify(device.apiKey, 'face-a');
    expect(fourth.body.data.action).toBe('ALREADY_CHECKED_OUT');
    expect(await prisma.attendance.count()).toBe(1);
    expect(await scanEventCount()).toBe(5);

    const row = await prisma.attendance.findFirstOrThrow();
    expect(row.method).toBe('FACE');
    expect(row.checkOutAt).not.toBeNull();
  });

  it('marks a check-in after start+grace as LATE with lateMinutes', async () => {
    freezeAt('2026-03-03T00:10:00.000Z'); // 08:10 HK => 5 minutes past 08:05
    const response = await kioskVerify(device.apiKey, 'face-a');
    expect(response.body.data.action).toBe('CHECK_IN');
    expect(response.body.data.attendance).toMatchObject({
      date: SCAN_DATE,
      status: 'LATE',
      lateMinutes: 5,
    });
    expect(response.body.data.message).toBe('Checked in — 5 minutes late');
  });

  it('treats the minute after the grace window as late', async () => {
    freezeAt('2026-03-03T00:05:30.000Z'); // 08:05:30 -> 30s past threshold
    const response = await kioskVerify(device.apiKey, 'face-a');
    expect(response.body.data.attendance.status).toBe('LATE');
    expect(response.body.data.attendance.lateMinutes).toBe(1);
  });

  it('creates a check-in when mode=OUT and there is no row yet', async () => {
    const response = await kioskVerify(device.apiKey, 'face-a', 'OUT');
    expect(response.body.data.action).toBe('CHECK_IN');
    expect(response.body.data.message).toBe('No check-in today; checked in instead.');
  });

  it('returns NO_MATCH for an unknown face and audits it', async () => {
    const response = await kioskVerify(device.apiKey, 'different-face');
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({
      matched: false,
      reason: 'NO_MATCH',
      message: 'Face not recognised',
    });
    expect(await prisma.attendance.count()).toBe(0);

    const audit = await prisma.scanEvent.findFirstOrThrow();
    expect(audit.result).toBe('NO_MATCH');
    expect(audit.action).toBe('UNRECOGNIZED');
    expect(audit.studentId).toBeNull();
    expect(audit.confidence).toBeLessThan(0.6);
  });

  it('returns NO_FACE and MULTIPLE_FACES with audit rows', async () => {
    const noFace = await kioskVerify(device.apiKey, '__MOCK_NO_FACE__');
    expect(noFace.body.data).toMatchObject({ matched: false, reason: 'NO_FACE' });

    const multiple = await kioskVerify(device.apiKey, '__MOCK_MULTIPLE_FACES__');
    expect(multiple.body.data).toMatchObject({ matched: false, reason: 'MULTIPLE_FACES' });

    const events = await prisma.scanEvent.findMany({ orderBy: { id: 'asc' } });
    expect(events.map((event) => event.result)).toEqual(['NO_FACE', 'MULTIPLE_FACES']);
    expect(events.every((event) => event.studentId === null)).toBe(true);
  });

  it('returns 422 for garbage bytes and 400 when the image is missing', async () => {
    const garbage = await request
      .post('/api/kiosk/verify')
      .set(deviceHeader(device.apiKey))
      .attach('image', Buffer.from('not-an-image'), { filename: 'x.jpg', contentType: 'image/jpeg' });
    expect(garbage.status).toBe(422);
    expect(garbage.body.error.code).toBe('FACE_NOT_DETECTED');

    const missing = await request.post('/api/kiosk/verify').set(deviceHeader(device.apiKey));
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects bad or inactive device keys and validates mode', async () => {
    const badKey = await kioskVerify('wrong-key', 'face-a');
    expect(badKey.status).toBe(401);
    expect(badKey.body.error.code).toBe('UNAUTHORIZED');

    await createDevice('inactive-key-12345', { active: false });
    const inactive = await kioskVerify('inactive-key-12345', 'face-a');
    expect(inactive.status).toBe(401);

    const badMode = await request
      .post('/api/kiosk/verify')
      .set(deviceHeader(device.apiKey))
      .field('mode', 'SIDEWAYS')
      .attach('image', Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('face-a')]), {
        filename: 'scan.png',
        contentType: 'image/png',
      });
    expect(badMode.status).toBe(400);
    expect(badMode.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('serves kiosk health and heartbeat envelopes and refreshes lastSeenAt', async () => {
    const health = await request.get('/api/kiosk/health').set(deviceHeader(device.apiKey));
    expect(health.status).toBe(200);
    expect(health.body).toMatchObject({
      success: true,
      data: {
        device: { id: device.id, name: 'Test Kiosk', location: 'Main Gate' },
        faceServiceReady: true,
      },
    });
    expect(typeof health.body.data.serverTime).toBe('string');

    const heartbeat = await request
      .post('/api/kiosk/heartbeat')
      .set(deviceHeader(device.apiKey));
    expect(heartbeat.status).toBe(200);
    expect(heartbeat.body.data.ok).toBe(true);

    const row = await prisma.device.findUniqueOrThrow({ where: { id: device.id } });
    expect(row.lastSeenAt).not.toBeNull();
  });

  it('writes audit rows for matched scans with confidence and action', async () => {
    await kioskVerify(device.apiKey, 'face-a');
    const audit = await prisma.scanEvent.findFirstOrThrow();
    expect(audit).toMatchObject({ action: 'CHECK_IN', result: 'SUCCESS', studentId: STUDENT_ID });
    expect(audit.confidence).toBeCloseTo(1, 5);
    expect(audit.imagePath).toBeNull(); // SAVE_SCAN_IMAGES=false
  });

  it('updates the settings-based late threshold', async () => {
    // Move the start time to 09:00 with 10 minutes grace => 08:03 is on time.
    await prisma.settings.update({
      where: { id: 1 },
      data: { dayStartTime: '09:00', lateGraceMinutes: 10 },
    });
    // Settings are cached for 10s in the app; wait it out via the service layer.
    const { invalidateSettingsCache } = await import('../src/services/settings.service');
    invalidateSettingsCache();

    const response = await kioskVerify(device.apiKey, 'face-a');
    expect(response.body.data.attendance.status).toBe('PRESENT');
  });

  it('a deleted device can no longer scan', async () => {
    const adminJwt = await loginAdmin();
    const remove = await request
      .delete(`/api/devices/${device.id}`)
      .set({ Authorization: `Bearer ${adminJwt}` });
    expect(remove.status).toBe(204);

    const verify = await kioskVerify(device.apiKey, 'face-a');
    expect(verify.status).toBe(401);
  });
});
