import { Router } from 'express';
import { config } from '../config/env';
import { prisma } from '../lib/prisma';
import { ApiError, errors } from '../lib/errors';
import { asyncHandler, clamp, parseOrThrow, round, sendOk } from '../lib/http';
import { parseUploadedImage } from '../lib/images';
import { now } from '../lib/clock';
import { toSchoolIso } from '../lib/time';
import { kioskAttendanceToDto, kioskStudentToDto } from '../lib/dto';
import { kioskModeSchema } from '../lib/schemas';
import {
  getFaceProvider,
  initFaceService,
  isFaceProviderReady,
} from '../face';
import { findBestMatch } from '../face/matcher';
import type { FaceExtraction } from '../face/types';
import { authenticateDevice } from '../middleware/auth';
import { kioskScanLimiter } from '../middleware/rateLimit';
import { uploadImage } from '../middleware/upload';
import { getSettings } from '../services/settings.service';
import { recordScanEvent } from '../services/audit.service';
import { recordScanAttendance } from '../services/attendance.service';
import { saveScanImage } from '../services/storage.service';

const router = Router();

router.use(authenticateDevice);

router.get(
  '/health',
  asyncHandler(async (req, res) => {
    const device = req.device!;
    const settings = await getSettings();
    sendOk(res, {
      device: { id: device.id, name: device.name, location: device.location },
      serverTime: toSchoolIso(now(), settings.timezone),
      faceServiceReady: isFaceProviderReady(),
    });
  }),
);

router.post(
  '/heartbeat',
  asyncHandler(async (req, res) => {
    const settings = await getSettings();
    // authenticateDevice already refreshed lastSeenAt.
    sendOk(res, { ok: true, serverTime: toSchoolIso(now(), settings.timezone) });
  }),
);

router.post(
  '/verify',
  kioskScanLimiter,
  uploadImage.single('image'),
  asyncHandler(async (req, res) => {
    const device = req.device!;
    const settings = await getSettings();
    const timeZone = settings.timezone;
    const { mode } = parseOrThrow(kioskModeSchema, { mode: req.body?.mode ?? 'AUTO' });

    const image = parseUploadedImage(req.file, 'image', config.maxUploadBytes);
    const imagePath = config.saveScanImages
      ? await saveScanImage(image.buffer, image.ext).catch(() => null)
      : null;

    const provider = getFaceProvider();
    let extraction: FaceExtraction;
    try {
      if (!provider.isReady()) {
        void initFaceService().catch(() => undefined);
        throw errors.faceServiceUnavailable();
      }
      extraction = await provider.extract(image.buffer);
    } catch (error) {
      await recordScanEvent({
        deviceId: device.id,
        action: 'UNRECOGNIZED',
        result: 'ERROR',
        imagePath,
      });
      if (error instanceof ApiError) throw error;
      void initFaceService().catch(() => undefined);
      throw errors.faceServiceUnavailable();
    }

    if (!extraction.ok) {
      const result =
        extraction.reason === 'MULTIPLE_FACES'
          ? 'MULTIPLE_FACES'
          : extraction.reason === 'NO_FACE'
            ? 'NO_FACE'
            : 'ERROR';
      await recordScanEvent({
        deviceId: device.id,
        action: 'UNRECOGNIZED',
        result,
        imagePath,
      });
      if (extraction.reason === 'UNREADABLE') {
        throw errors.faceNotDetected('The image could not be read');
      }
      sendOk(res, {
        matched: false,
        reason: extraction.reason,
        message:
          extraction.reason === 'NO_FACE'
            ? 'No face detected'
            : 'Multiple faces detected — one person at a time',
      });
      return;
    }

    const best = await findBestMatch(extraction.descriptor);
    const matched = best !== null && best.similarity >= settings.faceMatchThreshold;

    if (!matched || !best) {
      await recordScanEvent({
        deviceId: device.id,
        action: 'UNRECOGNIZED',
        result: 'NO_MATCH',
        confidence: best?.similarity ?? null,
        imagePath,
      });
      sendOk(res, { matched: false, reason: 'NO_MATCH', message: 'Face not recognised' });
      return;
    }

    const student = await prisma.student.findUnique({ where: { studentId: best.studentId } });
    if (!student) {
      await recordScanEvent({
        deviceId: device.id,
        action: 'UNRECOGNIZED',
        result: 'ERROR',
        confidence: best.similarity,
        imagePath,
      });
      throw errors.faceServiceUnavailable();
    }

    const outcome = await recordScanAttendance({
      studentId: student.studentId,
      deviceId: device.id,
      mode,
    });

    const scanAction =
      outcome.action === 'CHECK_IN' || outcome.action === 'ALREADY_CHECKED_IN'
        ? ('CHECK_IN' as const)
        : ('CHECK_OUT' as const);

    await recordScanEvent({
      deviceId: device.id,
      studentId: student.studentId,
      action: scanAction,
      result: 'SUCCESS',
      confidence: best.similarity,
      imagePath,
    });

    sendOk(res, {
      matched: true,
      action: outcome.action,
      confidence: round(clamp(best.similarity, 0, 1), 4),
      student: kioskStudentToDto(student),
      attendance: kioskAttendanceToDto(outcome.attendance, timeZone),
      message: outcome.message,
    });
  }),
);

export default router;
