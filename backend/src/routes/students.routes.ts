import { Router } from 'express';
import { config } from '../config/env';
import { errors } from '../lib/errors';
import { asyncHandler, parseOrThrow, pathParam, sendOk } from '../lib/http';
import { mimeForStoredImage, parseUploadedImage } from '../lib/images';
import {
  adminCreateStudentSchema,
  resetPasswordSchema,
  studentIdSchema,
  studentListQuerySchema,
  updateStudentSchema,
} from '../lib/schemas';
import { studentToDto } from '../lib/dto';
import { toSchoolIso } from '../lib/time';
import { authenticate, requireAdmin } from '../middleware/auth';
import { uploadImage } from '../middleware/upload';
import { getSettings } from '../services/settings.service';
import { readStoredFile } from '../services/storage.service';
import {
  createStudent,
  deactivateStudent,
  enrollFaceForStudent,
  getStudentDetail,
  getStudentMetaOptions,
  getStudentOrThrow,
  listStudents,
  resetStudentPassword,
  updateStudent,
} from '../services/students.service';

const router = Router();

/**
 * Authenticated photo serving (admin JWT or that student's own JWT).
 * Registered before the admin-only middleware block.
 */
router.get(
  '/:studentId/photo',
  authenticate,
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const studentId = parseOrThrow(studentIdSchema, pathParam(req.params.studentId));

    if (auth.actorType === 'student' && auth.student.studentId !== studentId) {
      throw errors.forbidden('You can only view your own photo');
    }

    const student = await getStudentOrThrow(studentId);
    if (!student.photoPath) throw errors.notFound('Photo not found');

    const buffer = await readStoredFile(student.photoPath);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.type(mimeForStoredImage(student.photoPath));
    res.send(buffer);
  }),
);

// Everything below requires an admin JWT.
router.use(authenticate);
router.use(requireAdmin);

router.get(
  '/meta/options',
  asyncHandler(async (_req, res) => {
    sendOk(res, await getStudentMetaOptions());
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = parseOrThrow(studentListQuerySchema, req.query);
    sendOk(res, await listStudents(query));
  }),
);

router.post(
  '/',
  uploadImage.single('faceImage'),
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(adminCreateStudentSchema, req.body);
    const image = req.file
      ? parseUploadedImage(req.file, 'faceImage', config.maxUploadBytes)
      : undefined;

    const result = await createStudent(body, {
      ...(image ? { image } : {}),
      requireFace: false,
    });
    const settings = await getSettings();

    sendOk(
      res,
      {
        student: studentToDto(result.student, settings.timezone),
        ...(result.initialPassword ? { initialPassword: result.initialPassword } : {}),
      },
      201,
    );
  }),
);

router.get(
  '/:studentId',
  asyncHandler(async (req, res) => {
    const studentId = parseOrThrow(studentIdSchema, pathParam(req.params.studentId));
    sendOk(res, await getStudentDetail(studentId));
  }),
);

router.patch(
  '/:studentId',
  asyncHandler(async (req, res) => {
    const studentId = parseOrThrow(studentIdSchema, pathParam(req.params.studentId));
    const body = parseOrThrow(updateStudentSchema, req.body);
    sendOk(res, await updateStudent(studentId, body));
  }),
);

router.delete(
  '/:studentId',
  asyncHandler(async (req, res) => {
    const studentId = parseOrThrow(studentIdSchema, pathParam(req.params.studentId));
    sendOk(res, await deactivateStudent(studentId));
  }),
);

router.post(
  '/:studentId/face',
  uploadImage.single('faceImage'),
  asyncHandler(async (req, res) => {
    const studentId = parseOrThrow(studentIdSchema, pathParam(req.params.studentId));
    const student = await getStudentOrThrow(studentId);
    const image = parseUploadedImage(req.file, 'faceImage', config.maxUploadBytes);

    const result = await enrollFaceForStudent(student, image);
    const settings = await getSettings();
    sendOk(res, {
      student: studentToDto(result.student, settings.timezone),
      faceEnrolled: true,
      enrolledAt: toSchoolIso(result.enrolledAt, settings.timezone),
    });
  }),
);

router.post(
  '/:studentId/reset-password',
  asyncHandler(async (req, res) => {
    const studentId = parseOrThrow(studentIdSchema, pathParam(req.params.studentId));
    const body = parseOrThrow(resetPasswordSchema, req.body ?? {});
    sendOk(res, await resetStudentPassword(studentId, body.newPassword));
  }),
);

export default router;
