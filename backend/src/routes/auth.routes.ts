import { Router } from 'express';
import { config } from '../config/env';
import { prisma } from '../lib/prisma';
import { errors } from '../lib/errors';
import { asyncHandler, parseOrThrow, sendOk } from '../lib/http';
import { parseUploadedImage } from '../lib/images';
import {
  adminLoginSchema,
  changePasswordSchema,
  publicStudentRegisterSchema,
  studentLoginSchema,
} from '../lib/schemas';
import { adminToDto, studentToDto } from '../lib/dto';
import {
  hashPassword,
  signAdminToken,
  signStudentToken,
  verifyPassword,
} from '../lib/security';
import { authenticate, requireAnyActor, requireStudent } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimit';
import { uploadImage } from '../middleware/upload';
import { getSettings } from '../services/settings.service';
import { createStudent } from '../services/students.service';

const router = Router();

router.post(
  '/admin/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(adminLoginSchema, req.body);
    const admin = await prisma.admin.findUnique({ where: { email: body.email.toLowerCase() } });
    if (!admin || !(await verifyPassword(body.password, admin.passwordHash))) {
      throw errors.unauthorized('Invalid email or password');
    }
    sendOk(res, { token: signAdminToken(admin), user: adminToDto(admin) });
  }),
);

router.post(
  '/student/login',
  authLimiter,
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(studentLoginSchema, req.body);
    const student = await prisma.student.findUnique({ where: { studentId: body.studentId } });
    if (!student || !(await verifyPassword(body.password, student.passwordHash))) {
      throw errors.unauthorized('Invalid student ID or password');
    }
    if (student.status !== 'ACTIVE') throw errors.unauthorized('Student account is inactive');
    const settings = await getSettings();
    sendOk(res, {
      token: signStudentToken(student),
      student: studentToDto(student, settings.timezone),
    });
  }),
);

router.post(
  '/student/register',
  authLimiter,
  uploadImage.single('faceImage'),
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(publicStudentRegisterSchema, req.body);
    const image = parseUploadedImage(req.file, 'faceImage', config.maxUploadBytes);
    const result = await createStudent(body, { image, requireFace: true });
    const settings = await getSettings();
    res.status(201).json({
      success: true,
      data: {
        token: signStudentToken(result.student),
        student: studentToDto(result.student, settings.timezone),
      },
    });
  }),
);

router.get(
  '/me',
  authenticate,
  requireAnyActor,
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    if (auth.actorType === 'admin') {
      sendOk(res, { actorType: 'admin', user: adminToDto(auth.admin) });
      return;
    }
    const settings = await getSettings();
    sendOk(res, { actorType: 'student', user: studentToDto(auth.student, settings.timezone) });
  }),
);

router.post(
  '/student/change-password',
  authenticate,
  requireStudent,
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    if (auth.actorType !== 'student') throw errors.forbidden();
    const body = parseOrThrow(changePasswordSchema, req.body);

    const valid = await verifyPassword(body.currentPassword, auth.student.passwordHash);
    if (!valid) throw errors.unauthorized('Current password is incorrect');

    await prisma.student.update({
      where: { studentId: auth.student.studentId },
      data: { passwordHash: await hashPassword(body.newPassword) },
    });
    sendOk(res, { ok: true });
  }),
);

export default router;
