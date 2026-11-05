import { Router } from 'express';
import crypto from 'node:crypto';
import { prisma } from '../lib/prisma';
import { errors } from '../lib/errors';
import { asyncHandler, parseOrThrow, pathParam, sendOk } from '../lib/http';
import { generateDeviceApiKey, sha256Hex } from '../lib/security';
import { now } from '../lib/clock';
import { deviceToDto } from '../lib/dto';
import { deviceCreateSchema, deviceUpdateSchema } from '../lib/schemas';
import { authenticate, requireAdmin } from '../middleware/auth';
import { getSettings } from '../services/settings.service';

const router = Router();

router.use(authenticate);
router.use(requireAdmin);

function deviceIdParam(id: string): string {
  if (id.trim().length === 0) throw errors.notFound('Device not found');
  return id;
}

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const settings = await getSettings();
    const at = now();
    const devices = await prisma.device.findMany({ orderBy: [{ createdAt: 'asc' }] });
    sendOk(res, {
      items: devices.map((device) => deviceToDto(device, at, settings.timezone)),
    });
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(deviceCreateSchema, req.body);
    const apiKey = generateDeviceApiKey();
    const settings = await getSettings();

    const device = await prisma.device.create({
      data: {
        id: crypto.randomUUID(),
        name: body.name,
        location: body.location,
        apiKeyHash: sha256Hex(apiKey),
        apiKeyPrefix: apiKey.slice(0, 16),
      },
    });

    sendOk(res, { device: deviceToDto(device, now(), settings.timezone), apiKey }, 201);
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = deviceIdParam(pathParam(req.params.id));
    const body = parseOrThrow(deviceUpdateSchema, req.body);
    const settings = await getSettings();

    const existing = await prisma.device.findUnique({ where: { id } });
    if (!existing) throw errors.notFound('Device not found');

    const device = await prisma.device.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.location !== undefined ? { location: body.location } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
      },
    });
    sendOk(res, { device: deviceToDto(device, now(), settings.timezone) });
  }),
);

router.post(
  '/:id/rotate-key',
  asyncHandler(async (req, res) => {
    const id = deviceIdParam(pathParam(req.params.id));
    const settings = await getSettings();
    const existing = await prisma.device.findUnique({ where: { id } });
    if (!existing) throw errors.notFound('Device not found');

    const apiKey = generateDeviceApiKey();
    const device = await prisma.device.update({
      where: { id },
      data: { apiKeyHash: sha256Hex(apiKey), apiKeyPrefix: apiKey.slice(0, 16) },
    });
    // The old key stops working immediately because only the new hash is stored.
    sendOk(res, { device: deviceToDto(device, now(), settings.timezone), apiKey });
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = deviceIdParam(pathParam(req.params.id));
    const existing = await prisma.device.findUnique({ where: { id } });
    if (!existing) throw errors.notFound('Device not found');
    await prisma.device.delete({ where: { id } });
    res.status(204).send();
  }),
);

export default router;
