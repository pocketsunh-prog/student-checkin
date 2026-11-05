import {
  Prisma,
  type Attendance,
  type AttendanceStatus,
  type Settings,
} from '@prisma/client';
import { prisma } from '../lib/prisma';
import { errors } from '../lib/errors';
import { now } from '../lib/clock';
import {
  attendanceStatusFromSettings,
  eachDate,
  inclusiveDaySpan,
  isSchoolDay,
  isValidDateOnly,
  lateMinutesFor,
  parseDateOnly,
  parseSchoolDays,
  toSchoolDateString,
} from '../lib/time';
import {
  absentAttendanceToDto,
  attendanceToDto,
  type AttendanceDto,
} from '../lib/dto';
import { parseIsoDate, round, toBigIntId } from '../lib/http';
import type { AttendancePatchInput, AttendancePutInput } from '../lib/schemas';
import { getSettings } from './settings.service';

export const DUPLICATE_SCAN_WINDOW_MS = 60_000;
const MAX_RANGE_DAYS = 366;

export type ScanMode = 'AUTO' | 'IN' | 'OUT';
export type ScanAction = 'CHECK_IN' | 'CHECK_OUT' | 'ALREADY_CHECKED_IN' | 'ALREADY_CHECKED_OUT';

export interface ScanAttendanceResult {
  action: ScanAction;
  attendance: Attendance;
  message: string;
}

export interface AttendanceSummary {
  totalStudents: number;
  present: number;
  late: number;
  absent: number;
  checkedOut: number;
  checkInRate: number;
}

export interface AttendanceListResult {
  items: AttendanceDto[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  summary: AttendanceSummary;
}

export interface AttendanceQuery {
  date?: string;
  from?: string;
  to?: string;
  class?: string;
  form?: string;
  studentId?: string;
  status?: AttendanceStatus;
  page: number;
  pageSize: number;
}

export interface AttendanceExportQuery {
  date?: string;
  from?: string;
  to?: string;
  class?: string;
  form?: string;
  studentId?: string;
  status?: AttendanceStatus;
}

interface BuildItemsParams {
  from: string;
  to: string;
  class?: string;
  form?: string;
  studentId?: string;
  settings: Settings;
}

const STUDENT_SUMMARY_SELECT = {
  studentId: true,
  firstName: true,
  lastName: true,
  class: true,
  form: true,
} satisfies Prisma.StudentSelect;

const ATTENDANCE_STUDENT_SELECT = {
  ...STUDENT_SUMMARY_SELECT,
  createdAt: true,
} satisfies Prisma.StudentSelect;

function validateRange(from: string, to: string): void {
  if (from > to) {
    throw errors.validation('`from` must be on or before `to`', { from: ['Must be on or before `to`'] });
  }
  if (inclusiveDaySpan(from, to) > MAX_RANGE_DAYS) {
    throw errors.validation(`Date range must be ${MAX_RANGE_DAYS} days or fewer`);
  }
}

function resolveRange(
  query: { date?: string; from?: string; to?: string },
  settings: Settings,
): { from: string; to: string } {
  if (query.date) return { from: query.date, to: query.date };
  if (query.from || query.to) {
    const from = query.from ?? query.to!;
    const to = query.to ?? query.from!;
    validateRange(from, to);
    return { from, to };
  }
  const today = toSchoolDateString(now(), settings.timezone);
  return { from: today, to: today };
}

function attendanceKey(studentId: string, date: string): string {
  return `${studentId}|${date}`;
}

/**
 * Merge stored attendance rows with synthesized ABSENT rows for active students
 * without a check-in. Absences are only synthesized on configured school days
 * and never before the student's enrollment date (Student.createdAt).
 */
async function buildItems(params: BuildItemsParams): Promise<{
  items: AttendanceDto[];
  summary: AttendanceSummary;
}> {
  const { from, to, settings } = params;
  const timeZone = settings.timezone;
  const schoolDays = parseSchoolDays(settings.schoolDays);
  const dateStrings = eachDate(from, to);

  const studentWhere: Prisma.StudentWhereInput = { status: 'ACTIVE' };
  if (params.studentId) studentWhere.studentId = params.studentId;
  if (params.class) studentWhere.class = params.class;
  if (params.form) studentWhere.form = params.form;

  const students = await prisma.student.findMany({
    where: studentWhere,
    select: ATTENDANCE_STUDENT_SELECT,
    orderBy: [{ class: 'asc' }, { lastName: 'asc' }, { firstName: 'asc' }, { studentId: 'asc' }],
  });

  // Absences must not be back-dated before the student joined the school.
  const enrolledOn = new Map(
    students.map((student) => [student.studentId, toSchoolDateString(student.createdAt, timeZone)]),
  );

  const studentRelationFilter: Prisma.StudentWhereInput = { status: 'ACTIVE' };
  if (params.class) studentRelationFilter.class = params.class;
  if (params.form) studentRelationFilter.form = params.form;

  const rows = await prisma.attendance.findMany({
    where: {
      date: { gte: parseDateOnly(from), lte: parseDateOnly(to) },
      ...(params.studentId ? { studentId: params.studentId } : {}),
      student: { is: studentRelationFilter },
    },
    include: { student: { select: STUDENT_SUMMARY_SELECT } },
    orderBy: [{ date: 'asc' }],
  });

  const rowMap = new Map<string, AttendanceDto>();
  for (const row of rows) {
    const dateString = row.date.toISOString().slice(0, 10);
    rowMap.set(attendanceKey(row.studentId, dateString), attendanceToDto(row, timeZone));
  }

  const items: AttendanceDto[] = [...rowMap.values()];
  for (const dateString of dateStrings) {
    if (!isSchoolDay(dateString, schoolDays)) continue;
    for (const student of students) {
      if (dateString < (enrolledOn.get(student.studentId) ?? dateString)) continue;
      const key = attendanceKey(student.studentId, dateString);
      if (!rowMap.has(key)) {
        items.push(absentAttendanceToDto(student, dateString));
      }
    }
  }

  items.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.class !== b.class) return a.class.localeCompare(b.class);
    if (a.fullName !== b.fullName) return a.fullName.localeCompare(b.fullName);
    return a.studentId.localeCompare(b.studentId);
  });

  const present = items.filter((item) => item.status === 'PRESENT').length;
  const late = items.filter((item) => item.status === 'LATE').length;
  const absent = items.filter((item) => item.status === 'ABSENT').length;
  const checkedOut = items.filter((item) => item.checkedOut).length;
  const denominator = items.length;
  const summary: AttendanceSummary = {
    totalStudents: students.length,
    present,
    late,
    absent,
    checkedOut,
    checkInRate: denominator > 0 ? round(((present + late) / denominator) * 100, 2) : 0,
  };

  return { items, summary };
}

export async function listAttendance(query: AttendanceQuery): Promise<AttendanceListResult> {
  const settings = await getSettings();
  const { from, to } = resolveRange(query, settings);
  const { items, summary } = await buildItems({
    from,
    to,
    ...(query.class ? { class: query.class } : {}),
    ...(query.form ? { form: query.form } : {}),
    ...(query.studentId ? { studentId: query.studentId } : {}),
    settings,
  });

  const filtered = query.status ? items.filter((item) => item.status === query.status) : items;
  const total = filtered.length;
  const start = (query.page - 1) * query.pageSize;

  return {
    items: filtered.slice(start, start + query.pageSize),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.ceil(total / query.pageSize),
    summary,
  };
}

export interface StudentAttendanceResult {
  items: AttendanceDto[];
  summary: { present: number; late: number; absent: number; checkedOut: number };
}

export async function getStudentAttendance(
  studentId: string,
  query: { from?: string; to?: string },
): Promise<StudentAttendanceResult> {
  const settings = await getSettings();
  const today = toSchoolDateString(now(), settings.timezone);
  const from = query.from ?? `${today.slice(0, 7)}-01`;
  const to = query.to ?? today;
  validateRange(from, to);

  const { items } = await buildItems({ from, to, studentId, settings });
  return {
    items,
    summary: {
      present: items.filter((item) => item.status === 'PRESENT').length,
      late: items.filter((item) => item.status === 'LATE').length,
      absent: items.filter((item) => item.status === 'ABSENT').length,
      checkedOut: items.filter((item) => item.checkedOut).length,
    },
  };
}

export async function exportAttendanceCsv(query: AttendanceExportQuery): Promise<{
  filename: string;
  csv: string;
}> {
  const settings = await getSettings();
  const { from, to } = resolveRange(query, settings);
  const { items } = await buildItems({
    from,
    to,
    ...(query.class ? { class: query.class } : {}),
    ...(query.form ? { form: query.form } : {}),
    ...(query.studentId ? { studentId: query.studentId } : {}),
    settings,
  });
  const filtered = query.status ? items.filter((item) => item.status === query.status) : items;

  const header = [
    'student_id',
    'full_name',
    'class',
    'form',
    'date',
    'check_in',
    'check_out',
    'status',
    'late_minutes',
    'method',
    'note',
  ];
  const lines = [header.join(',')];
  for (const item of filtered) {
    lines.push(
      [
        item.studentId,
        item.fullName,
        item.class,
        item.form,
        item.date,
        item.checkInAt ?? '',
        item.checkOutAt ?? '',
        item.status,
        String(item.lateMinutes),
        item.method,
        item.note ?? '',
      ]
        .map(csvEscape)
        .join(','),
    );
  }

  return {
    filename: `attendance_${from}_${to}.csv`,
    csv: lines.join('\r\n'),
  };
}

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

// ---------------------------------------------------------------------------
// Kiosk attendance state machine (docs/API.md section 5)
// ---------------------------------------------------------------------------

export async function recordScanAttendance(args: {
  studentId: string;
  deviceId: string;
  mode: ScanMode;
}): Promise<ScanAttendanceResult> {
  try {
    return await evaluateScan(args);
  } catch (error) {
    // Two kiosks scanning the same student concurrently: the unique row already
    // existed by the time we tried to create it. Re-evaluate against the row.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return evaluateScan(args);
    }
    throw error;
  }
}

async function evaluateScan(args: {
  studentId: string;
  deviceId: string;
  mode: ScanMode;
}): Promise<ScanAttendanceResult> {
  const settings = await getSettings();
  const at = now();
  const dateString = toSchoolDateString(at, settings.timezone);
  const date = parseDateOnly(dateString);

  const existing = await prisma.attendance.findUnique({
    where: { studentId_date: { studentId: args.studentId, date } },
  });

  if (!existing) {
    const { status, lateMinutes } = attendanceStatusFromSettings(at, settings);
    const created = await prisma.attendance.create({
      data: {
        studentId: args.studentId,
        date,
        checkInAt: at,
        status,
        lateMinutes,
        method: 'FACE',
        checkInDeviceId: args.deviceId,
      },
    });

    let message: string;
    if (args.mode === 'OUT') {
      message = 'No check-in today; checked in instead.';
    } else if (status === 'LATE') {
      message = `Checked in — ${lateMinutes} minute${lateMinutes === 1 ? '' : 's'} late`;
    } else {
      message = 'Checked in';
    }
    return { action: 'CHECK_IN', attendance: created, message };
  }

  if (existing.status === 'ABSENT') {
    // A stored ABSENT row can only come from a legacy/manual import. A real scan
    // is authoritative: convert the row into a check-in.
    const { status, lateMinutes } = attendanceStatusFromSettings(at, settings);
    const converted = await prisma.attendance.update({
      where: { id: existing.id },
      data: {
        checkInAt: at,
        checkOutAt: null,
        status,
        lateMinutes,
        method: 'FACE',
        checkInDeviceId: args.deviceId,
        checkOutDeviceId: null,
      },
    });
    const message =
      status === 'LATE' ? `Checked in — ${lateMinutes} minute${lateMinutes === 1 ? '' : 's'} late` : 'Checked in';
    return { action: 'CHECK_IN', attendance: converted, message };
  }

  if (!existing.checkOutAt) {
    const checkInAt = existing.checkInAt ?? existing.createdAt;
    const elapsedMs = at.getTime() - checkInAt.getTime();
    if (elapsedMs <= DUPLICATE_SCAN_WINDOW_MS) {
      return { action: 'ALREADY_CHECKED_IN', attendance: existing, message: 'Already checked in' };
    }
    const updated = await prisma.attendance.update({
      where: { id: existing.id },
      data: { checkOutAt: at, checkOutDeviceId: args.deviceId },
    });
    return { action: 'CHECK_OUT', attendance: updated, message: 'Checked out' };
  }

  return { action: 'ALREADY_CHECKED_OUT', attendance: existing, message: 'Already checked out' };
}

// ---------------------------------------------------------------------------
// Manual corrections
// ---------------------------------------------------------------------------

function parseAbsentId(id: string): { studentId: string; date: string } {
  const match = /^absent:(.+):(\d{4}-\d{2}-\d{2})$/.exec(id);
  if (!match) throw errors.notFound('Attendance record not found');
  const studentId = match[1]!;
  const date = match[2]!;
  if (!isValidDateOnly(date)) throw errors.notFound('Attendance record not found');
  return { studentId, date };
}

function validateCheckTimes(checkInAt: Date | null, checkOutAt: Date | null): void {
  if (checkInAt && checkOutAt && checkInAt.getTime() > checkOutAt.getTime()) {
    throw errors.validation('`checkInAt` must be on or before `checkOutAt`', {
      checkOutAt: ['Must be on or after checkInAt'],
    });
  }
}

/** PATCH /api/attendance/:id — numeric id or synthesized absent id. */
export async function patchAttendance(
  id: string,
  body: AttendancePatchInput,
): Promise<AttendanceDto> {
  const settings = await getSettings();

  if (id.startsWith('absent:')) {
    const { studentId, date } = parseAbsentId(id);
    if (body.status === undefined) {
      throw errors.validation('`status` is required for synthesized absent rows');
    }
    return putAttendance(studentId, date, {
      status: body.status,
      ...(body.checkInAt !== undefined ? { checkInAt: body.checkInAt } : {}),
      ...(body.checkOutAt !== undefined ? { checkOutAt: body.checkOutAt } : {}),
      ...(body.note !== undefined ? { note: body.note } : {}),
    });
  }

  const numericId = toBigIntId(id, 'Attendance record');
  const row = await prisma.attendance.findUnique({
    where: { id: numericId },
    include: { student: { select: STUDENT_SUMMARY_SELECT } },
  });
  if (!row) throw errors.notFound('Attendance record not found');

  if (body.status === 'ABSENT') {
    await prisma.attendance.delete({ where: { id: row.id } });
    const dateString = row.date.toISOString().slice(0, 10);
    return absentAttendanceToDto(row.student, dateString);
  }

  const effectiveCheckIn =
    body.checkInAt === undefined
      ? row.checkInAt
      : body.checkInAt === null
        ? null
        : parseIsoDate(body.checkInAt, 'checkInAt');
  const effectiveCheckOut =
    body.checkOutAt === undefined
      ? row.checkOutAt
      : body.checkOutAt === null
        ? null
        : parseIsoDate(body.checkOutAt, 'checkOutAt');
  validateCheckTimes(effectiveCheckIn, effectiveCheckOut);

  const finalStatus = body.status ?? row.status;
  const data: Prisma.AttendanceUpdateInput = { method: 'MANUAL' };
  if (body.checkInAt !== undefined) data.checkInAt = effectiveCheckIn;
  if (body.checkOutAt !== undefined) data.checkOutAt = effectiveCheckOut;
  if (body.note !== undefined) data.note = body.note;
  if (body.status !== undefined) data.status = body.status;

  if (finalStatus === 'PRESENT') {
    data.lateMinutes = 0;
  } else if (finalStatus === 'LATE') {
    data.lateMinutes = Math.max(
      1,
      lateMinutesFor(
        effectiveCheckIn ?? now(),
        settings.timezone,
        settings.dayStartTime,
        settings.lateGraceMinutes,
      ),
    );
  }

  const updated = await prisma.attendance.update({
    where: { id: row.id },
    data,
    include: { student: { select: STUDENT_SUMMARY_SELECT } },
  });
  return attendanceToDto(updated, settings.timezone);
}

/** PUT /api/attendance/:studentId/:date — upsert for synthesized absent rows. */
export async function putAttendance(
  studentId: string,
  dateString: string,
  body: AttendancePutInput,
): Promise<AttendanceDto> {
  const settings = await getSettings();
  if (!isValidDateOnly(dateString)) {
    throw errors.validation('Invalid date', { date: ['Expected YYYY-MM-DD'] });
  }

  const student = await prisma.student.findUnique({
    where: { studentId },
    select: STUDENT_SUMMARY_SELECT,
  });
  if (!student) throw errors.notFound('Student not found');

  const date = parseDateOnly(dateString);
  const existing = await prisma.attendance.findUnique({
    where: { studentId_date: { studentId, date } },
    include: { student: { select: STUDENT_SUMMARY_SELECT } },
  });

  if (body.status === 'ABSENT') {
    if (existing) await prisma.attendance.delete({ where: { id: existing.id } });
    return absentAttendanceToDto(student, dateString);
  }

  const checkInAt =
    body.checkInAt === undefined
      ? (existing?.checkInAt ?? now())
      : body.checkInAt === null
        ? now()
        : parseIsoDate(body.checkInAt, 'checkInAt');
  const checkOutAt =
    body.checkOutAt === undefined
      ? (existing?.checkOutAt ?? null)
      : body.checkOutAt === null
        ? null
        : parseIsoDate(body.checkOutAt, 'checkOutAt');
  validateCheckTimes(checkInAt, checkOutAt);

  const lateMinutes =
    body.status === 'LATE'
      ? Math.max(
          1,
          lateMinutesFor(
            checkInAt,
            settings.timezone,
            settings.dayStartTime,
            settings.lateGraceMinutes,
          ),
        )
      : 0;

  const data = {
    status: body.status,
    checkInAt,
    checkOutAt,
    lateMinutes,
    method: 'MANUAL' as const,
    ...(body.note !== undefined ? { note: body.note } : {}),
  };

  const row = await prisma.attendance.upsert({
    where: { studentId_date: { studentId, date } },
    create: { studentId, date, ...data },
    update: data,
    include: { student: { select: STUDENT_SUMMARY_SELECT } },
  });
  return attendanceToDto(row, settings.timezone);
}

export { resolveRange, validateRange, STUDENT_SUMMARY_SELECT };
