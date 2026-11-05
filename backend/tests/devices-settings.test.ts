import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { sha256Hex } from '../src/lib/security';
import {
  authHeader,
  createAdmin,
  createSettings,
  deviceHeader,
  loginAdmin,
  request,
  resetDb,
  resetTestClock,
  studentToken,
  registerStudent,
} from './helpers';

describe('Device management & settings', () => {
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

  it('lists devices with the standard envelope', async () => {
    const list = await request.get('/api/devices').set(authHeader(adminJwt));
    expect(list.status).toBe(200);
    expect(list.body.success).toBe(true);
    expect(list.body.data.items).toEqual([]);
  });

  it('creates a device and returns its API key exactly once', async () => {
    const create = await request
      .post('/api/devices')
      .set(authHeader(adminJwt))
      .send({ name: 'Main Gate Tablet', location: 'Main Entrance' });

    expect(create.status).toBe(201);
    expect(create.body.data.apiKey).toMatch(/^kiosk_/);
    expect(create.body.data.device).toMatchObject({
      name: 'Main Gate Tablet',
      location: 'Main Entrance',
      active: true,
      online: false,
      lastSeenAt: null,
    });
    expect(create.body.data.device.apiKeyPrefix).toBe(create.body.data.apiKey.slice(0, 16));
    expect(JSON.stringify(create.body.data.device)).not.toContain(create.body.data.apiKey);

    const stored = await prisma.device.findUniqueOrThrow({
      where: { id: create.body.data.device.id },
    });
    expect(stored.apiKeyHash).toBe(sha256Hex(create.body.data.apiKey as string));
    expect(stored.apiKeyHash).not.toBe(create.body.data.apiKey);

    const health = await request
      .get('/api/kiosk/health')
      .set(deviceHeader(create.body.data.apiKey as string));
    expect(health.status).toBe(200);

    const list = await request.get('/api/devices').set(authHeader(adminJwt));
    expect(list.body.data.items).toHaveLength(1);
    expect(list.body.data.items[0].online).toBe(true);
    expect(list.body.data.items[0].apiKey).toBeUndefined();

    const patch = await request
      .patch(`/api/devices/${create.body.data.device.id}`)
      .set(authHeader(adminJwt))
      .send({ name: 'Renamed Kiosk', location: 'Side Gate', active: true });
    expect(patch.status).toBe(200);
    expect(patch.body.data.device).toMatchObject({ name: 'Renamed Kiosk', location: 'Side Gate' });
  });

  it('rotates keys: old key stops working immediately', async () => {
    const create = await request
      .post('/api/devices')
      .set(authHeader(adminJwt))
      .send({ name: 'Kiosk', location: 'Gate' });
    const { id } = create.body.data.device;
    const oldKey = create.body.data.apiKey as string;

    const rotate = await request
      .post(`/api/devices/${id}/rotate-key`)
      .set(authHeader(adminJwt));
    expect(rotate.status).toBe(200);
    const newKey = rotate.body.data.apiKey as string;
    expect(newKey).toMatch(/^kiosk_/);
    expect(newKey).not.toBe(oldKey);

    const oldHealth = await request.get('/api/kiosk/health').set(deviceHeader(oldKey));
    expect(oldHealth.status).toBe(401);

    const newHealth = await request.get('/api/kiosk/health').set(deviceHeader(newKey));
    expect(newHealth.status).toBe(200);
  });

  it('deactivates and deletes devices', async () => {
    const create = await request
      .post('/api/devices')
      .set(authHeader(adminJwt))
      .send({ name: 'Kiosk', location: 'Gate' });
    const { id } = create.body.data.device;
    const apiKey = create.body.data.apiKey as string;

    const deactivate = await request
      .patch(`/api/devices/${id}`)
      .set(authHeader(adminJwt))
      .send({ active: false });
    expect(deactivate.status).toBe(200);

    const health = await request.get('/api/kiosk/health').set(deviceHeader(apiKey));
    expect(health.status).toBe(401);

    const remove = await request.delete(`/api/devices/${id}`).set(authHeader(adminJwt));
    expect(remove.status).toBe(204);
    expect(remove.text).toBe('');
    expect(await prisma.device.count()).toBe(0);

    const missing = await request.delete(`/api/devices/${id}`).set(authHeader(adminJwt));
    expect(missing.status).toBe(404);

    const invalidPatch = await request
      .patch('/api/devices/not-found')
      .set(authHeader(adminJwt))
      .send({ name: 'x' });
    expect(invalidPatch.status).toBe(404);
  });

  it('reads and updates settings', async () => {
    const initial = await request.get('/api/settings').set(authHeader(adminJwt));
    expect(initial.status).toBe(200);
    expect(initial.body.data).toEqual({
      schoolName: 'Greenfield Secondary School',
      dayStartTime: '08:00',
      lateGraceMinutes: 5,
      timezone: 'Asia/Hong_Kong',
      faceMatchThreshold: 0.6,
      schoolDays: [1, 2, 3, 4, 5],
    });

    const update = await request
      .put('/api/settings')
      .set(authHeader(adminJwt))
      .send({
        schoolName: 'Test Secondary School',
        dayStartTime: '08:30',
        lateGraceMinutes: 10,
        timezone: 'Asia/Tokyo',
        faceMatchThreshold: 0.7,
        schoolDays: [1, 2, 3, 4, 5, 6],
      });
    expect(update.status).toBe(200);
    expect(update.body.data).toMatchObject({
      schoolName: 'Test Secondary School',
      dayStartTime: '08:30',
      lateGraceMinutes: 10,
      timezone: 'Asia/Tokyo',
      faceMatchThreshold: 0.7,
      schoolDays: [1, 2, 3, 4, 5, 6],
    });

    const reread = await request.get('/api/settings').set(authHeader(adminJwt));
    expect(reread.body.data.timezone).toBe('Asia/Tokyo');

    const partial = await request
      .put('/api/settings')
      .set(authHeader(adminJwt))
      .send({ faceMatchThreshold: 0.65 });
    expect(partial.status).toBe(200);
    expect(partial.body.data).toMatchObject({
      faceMatchThreshold: 0.65,
      timezone: 'Asia/Tokyo',
    });
  });

  it('validates settings input', async () => {
    const cases: Array<Record<string, unknown>> = [
      {},
      { timezone: 'Mars/Olympus' },
      { faceMatchThreshold: 1.5 },
      { dayStartTime: '8:00' },
      { schoolDays: [] },
      { schoolDays: [1, 1, 2] },
      { lateGraceMinutes: -1 },
      { schoolName: '' },
    ];
    for (const body of cases) {
      const response = await request.put('/api/settings').set(authHeader(adminJwt)).send(body);
      expect(response.status, `body ${JSON.stringify(body)}`).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('exposes a public health envelope', async () => {
    const health = await request.get('/api/health');
    expect(health.status).toBe(200);
    expect(health.body).toMatchObject({
      success: true,
      data: { status: 'ok', db: 'ok', faceService: 'ready' },
    });
    expect(typeof health.body.data.uptimeSeconds).toBe('number');
  });

  it('scopes devices and settings to admins', async () => {
    await registerStudent();
    const studentJwt = await studentToken();
    for (const path of ['/api/devices', '/api/settings']) {
      const response = await request.get(path).set(authHeader(studentJwt));
      expect(response.status).toBe(403);
    }
  });
});
