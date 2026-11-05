import { Router } from 'express';
import { config } from '../config/env';
import { errors } from '../lib/errors';
import { asyncHandler, parseOrThrow, sendOk } from '../lib/http';
import { parseUploadedImage } from '../lib/images';
import { studentAttendanceQuerySchema } from '../lib/schemas';
import { studentToDto } from '../lib/dto';
import { toSchoolIso } from '../lib/time';
import { authenticate, requireStudent } from '../middleware/auth';
import { uploadImage } from '../middleware/upload';
import { getSettings } from '../services/settings.service';
import { enrollFaceForStudent } from '../services/students.service';
import { getStudentAttendance } from '../services/attendance.service';
import type { Student } from '@prisma/client';

const router = Router();

router.use(authenticate);
router.use(requireStudent);

function currentStudent(req: import('express').Request): Student {
  const auth = req.auth;
  if (!auth || auth.actorType !== 'student') {
    throw errors.unauthorized('Student authentication required');
  }
  return auth.student;
}

router.get(
  '/profile',
  asyncHandler(async (req, res) => {
    const student = currentStudent(req);
    const settings = await getSettings();
    sendOk(res, studentToDto(student, settings.timezone));
  }),
);

router.post(
  '/enroll-face',
  uploadImage.single('faceImage'),
  asyncHandler(async (req, res) => {
    const student = currentStudent(req);
    const image = parseUploadedImage(req.file, 'faceImage', config.maxUploadBytes);
    const result = await enrollFaceForStudent(student, image);
    const settings = await getSettings();
    sendOk(res, {
      faceEnrolled: true,
      enrolledAt: toSchoolIso(result.enrolledAt, settings.timezone),
    });
  }),
);

router.get(
  '/attendance',
  asyncHandler(async (req, res) => {
    const student = currentStudent(req);
    const query = parseOrThrow(studentAttendanceQuerySchema, req.query);
    sendOk(res, await getStudentAttendance(student.studentId, query));
  }),
);

export default router;
