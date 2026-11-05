import { Router } from 'express';
import { asyncHandler, parseOrThrow, pathParam, sendOk } from '../lib/http';
import { now } from '../lib/clock';
import { toSchoolDateString } from '../lib/time';
import {
  attendanceExportQuerySchema,
  attendancePatchSchema,
  attendancePutSchema,
  attendanceQuerySchema,
  studentIdSchema,
} from '../lib/schemas';
import { authenticate, requireAdmin } from '../middleware/auth';
import { getSettings } from '../services/settings.service';
import {
  exportAttendanceCsv,
  listAttendance,
  patchAttendance,
  putAttendance,
} from '../services/attendance.service';

const router = Router();

router.use(authenticate);
router.use(requireAdmin);

router.get(
  '/export',
  asyncHandler(async (req, res) => {
    const query = parseOrThrow(attendanceExportQuerySchema, req.query);
    const result = await exportAttendanceCsv(query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.send(result.csv);
  }),
);

router.get(
  '/today',
  asyncHandler(async (req, res) => {
    const settings = await getSettings();
    const today = toSchoolDateString(now(), settings.timezone);
    const query = parseOrThrow(attendanceQuerySchema, { ...req.query, date: today });
    sendOk(res, await listAttendance(query));
  }),
);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const query = parseOrThrow(attendanceQuerySchema, req.query);
    sendOk(res, await listAttendance(query));
  }),
);

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const body = parseOrThrow(attendancePatchSchema, req.body);
    sendOk(res, await patchAttendance(pathParam(req.params.id), body));
  }),
);

router.put(
  '/:studentId/:date',
  asyncHandler(async (req, res) => {
    const studentId = parseOrThrow(studentIdSchema, pathParam(req.params.studentId));
    const body = parseOrThrow(attendancePutSchema, req.body);
    sendOk(res, await putAttendance(studentId, pathParam(req.params.date), body));
  }),
);

export default router;
