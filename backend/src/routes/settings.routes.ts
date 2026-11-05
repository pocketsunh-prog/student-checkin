import { Router } from 'express';
import { asyncHandler, parseOrThrow, sendOk } from '../lib/http';
import { settingsUpdateSchema } from '../lib/schemas';
import { settingsToDto } from '../lib/dto';
import { authenticate, requireAdmin } from '../middleware/auth';
import { getSettings, updateSettings } from '../services/settings.service';

const router = Router();

router.use(authenticate);
router.use(requireAdmin);

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    sendOk(res, settingsToDto(await getSettings()));
  }),
);

router.put(
  '/',
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(settingsUpdateSchema, req.body);
    const updated = await updateSettings({
      ...(body.schoolName !== undefined ? { schoolName: body.schoolName } : {}),
      ...(body.dayStartTime !== undefined ? { dayStartTime: body.dayStartTime } : {}),
      ...(body.lateGraceMinutes !== undefined ? { lateGraceMinutes: body.lateGraceMinutes } : {}),
      ...(body.timezone !== undefined ? { timezone: body.timezone } : {}),
      ...(body.faceMatchThreshold !== undefined
        ? { faceMatchThreshold: body.faceMatchThreshold }
        : {}),
      ...(body.schoolDays !== undefined ? { schoolDays: body.schoolDays } : {}),
    });
    sendOk(res, settingsToDto(updated));
  }),
);

export default router;
