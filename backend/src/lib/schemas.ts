import { z } from 'zod';
import { isValidDateOnly, isValidHhMm, isValidTimezone } from './time';

const DATE_ONLY_MESSAGE = 'Expected a valid YYYY-MM-DD date';
const ISO_MESSAGE = 'Expected an ISO-8601 timestamp';

export const STUDENT_ID_REGEX = /^[A-Za-z0-9_-]{3,20}$/;

export const dateOnlySchema = z.string().refine(isValidDateOnly, DATE_ONLY_MESSAGE);

export const isoDateTimeSchema = z
  .string()
  .refine((value) => !Number.isNaN(new Date(value).getTime()), ISO_MESSAGE);

export const studentIdSchema = z
  .string()
  .trim()
  .regex(STUDENT_ID_REGEX, 'Student ID must be 3-20 characters: letters, digits, _ or -');

const personName = (label: string) =>
  z.string().trim().min(1, `${label} is required`).max(60, `${label} must be at most 60 characters`);

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters');

const dobSchema = dateOnlySchema.refine((value) => {
  const dob = new Date(`${value}T00:00:00.000Z`);
  const today = new Date();
  const todayUtc = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  return dob.getTime() < todayUtc.getTime();
}, 'Date of birth must be in the past');

const shortText = (label: string, max: number) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} must be at most ${max} characters`);

/**
 * Multipart form fields arrive as strings; an empty string means "not provided".
 */
const emptyToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => {
    if (typeof value === 'string' && value.trim() === '') return undefined;
    return value;
  }, schema.optional());

const optionalText = (max: number) =>
  emptyToUndefined(z.string().trim().max(max, `Must be at most ${max} characters`));

const optionalStudentId = emptyToUndefined(studentIdSchema);

const optionalDateOnly = emptyToUndefined(dateOnlySchema);

const paginationShape = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const adminLoginSchema = z.object({
  email: z
    .string()
    .trim()
    .max(190)
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'A valid email address is required'),
  password: z.string().min(1, 'Password is required').max(128),
});

export const studentLoginSchema = z.object({
  studentId: studentIdSchema,
  password: z.string().min(1, 'Password is required').max(128),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required').max(128),
  newPassword: passwordSchema,
});

// ---------------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------------

const studentBaseSchema = z.object({
  studentId: studentIdSchema,
  firstName: personName('First name'),
  lastName: personName('Last name'),
  dob: dobSchema,
  sex: z.enum(['MALE', 'FEMALE', 'OTHER'], { message: 'Sex must be MALE, FEMALE or OTHER' }),
  class: shortText('Class', 32),
  form: shortText('Form', 32),
});

export const publicStudentRegisterSchema = studentBaseSchema.extend({
  password: passwordSchema,
});

export const adminCreateStudentSchema = studentBaseSchema.extend({
  password: emptyToUndefined(passwordSchema),
});

export const updateStudentSchema = z.object({
  firstName: personName('First name').optional(),
  lastName: personName('Last name').optional(),
  dob: dobSchema.optional(),
  sex: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  class: shortText('Class', 32).optional(),
  form: shortText('Form', 32).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export const resetPasswordSchema = z.object({
  newPassword: emptyToUndefined(passwordSchema),
});

export const studentListQuerySchema = z.object({
  search: optionalText(100),
  class: optionalText(32),
  form: optionalText(32),
  status: emptyToUndefined(z.enum(['ACTIVE', 'INACTIVE', 'ALL'])).default('ACTIVE'),
  faceEnrolled: emptyToUndefined(z.enum(['true', 'false'])),
  sort: emptyToUndefined(z.enum(['studentId', 'name', 'createdAt'])).default('studentId'),
  ...paginationShape,
});

// ---------------------------------------------------------------------------
// Devices
// ---------------------------------------------------------------------------

export const deviceCreateSchema = z.object({
  name: shortText('Device name', 120),
  location: shortText('Location', 190),
});

export const deviceUpdateSchema = z
  .object({
    name: shortText('Device name', 120).optional(),
    location: shortText('Location', 190).optional(),
    active: z.boolean().optional(),
  })
  .refine(
    (value) => value.name !== undefined || value.location !== undefined || value.active !== undefined,
    'At least one field is required',
  );

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const settingsUpdateSchema = z
  .object({
    schoolName: shortText('School name', 190).optional(),
    dayStartTime: z
      .string()
      .refine(isValidHhMm, 'Expected HH:mm (24-hour)')
      .optional(),
    lateGraceMinutes: z.coerce.number().int().min(0).max(240).optional(),
    timezone: z
      .string()
      .refine(isValidTimezone, 'Unknown IANA timezone')
      .optional(),
    faceMatchThreshold: z.coerce.number().min(0, 'Threshold must be 0..1').max(1, 'Threshold must be 0..1').optional(),
    schoolDays: z
      .array(z.coerce.number().int().min(1).max(7))
      .min(1, 'schoolDays must not be empty')
      .max(7)
      .refine((days) => new Set(days).size === days.length, 'schoolDays must be unique')
      .optional(),
  })
  .refine(
    (value) =>
      value.schoolName !== undefined ||
      value.dayStartTime !== undefined ||
      value.lateGraceMinutes !== undefined ||
      value.timezone !== undefined ||
      value.faceMatchThreshold !== undefined ||
      value.schoolDays !== undefined,
    'At least one setting is required',
  );

// ---------------------------------------------------------------------------
// Kiosk
// ---------------------------------------------------------------------------

export const kioskModeSchema = z.object({
  mode: emptyToUndefined(z.enum(['AUTO', 'IN', 'OUT'])).default('AUTO'),
});

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

export const attendanceQuerySchema = z.object({
  date: optionalDateOnly,
  from: optionalDateOnly,
  to: optionalDateOnly,
  class: optionalText(32),
  form: optionalText(32),
  studentId: optionalStudentId,
  status: emptyToUndefined(z.enum(['PRESENT', 'LATE', 'ABSENT'])),
  ...paginationShape,
});

export const attendanceExportQuerySchema = z.object({
  date: optionalDateOnly,
  from: optionalDateOnly,
  to: optionalDateOnly,
  class: optionalText(32),
  form: optionalText(32),
  studentId: optionalStudentId,
  status: emptyToUndefined(z.enum(['PRESENT', 'LATE', 'ABSENT'])),
  format: emptyToUndefined(z.enum(['csv'])).default('csv'),
});

export const attendancePatchSchema = z
  .object({
    status: z.enum(['PRESENT', 'LATE', 'ABSENT']).optional(),
    checkInAt: isoDateTimeSchema.nullable().optional(),
    checkOutAt: isoDateTimeSchema.nullable().optional(),
    note: z.string().max(500, 'Note must be at most 500 characters').nullable().optional(),
  })
  .refine(
    (value) =>
      value.status !== undefined ||
      value.checkInAt !== undefined ||
      value.checkOutAt !== undefined ||
      value.note !== undefined,
    'At least one field is required',
  );

export const attendancePutSchema = z.object({
  status: z.enum(['PRESENT', 'LATE', 'ABSENT']),
  checkInAt: isoDateTimeSchema.nullable().optional(),
  checkOutAt: isoDateTimeSchema.nullable().optional(),
  note: z.string().max(500, 'Note must be at most 500 characters').nullable().optional(),
});

export const studentAttendanceQuerySchema = z.object({
  from: optionalDateOnly,
  to: optionalDateOnly,
});

// ---------------------------------------------------------------------------
// Reports / dashboard
// ---------------------------------------------------------------------------

export const reportQuerySchema = z.object({
  from: dateOnlySchema,
  to: dateOnlySchema,
  class: optionalText(32),
  form: optionalText(32),
  groupBy: emptyToUndefined(z.enum(['day', 'student'])).default('day'),
});

export const dashboardQuerySchema = z.object({
  date: optionalDateOnly,
});

export type AttendanceQueryInput = z.infer<typeof attendanceQuerySchema>;
export type AttendanceExportQueryInput = z.infer<typeof attendanceExportQuerySchema>;
export type AttendancePatchInput = z.infer<typeof attendancePatchSchema>;
export type AttendancePutInput = z.infer<typeof attendancePutSchema>;
export type StudentListQueryInput = z.infer<typeof studentListQuerySchema>;
export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;
export type ReportQueryInput = z.infer<typeof reportQuerySchema>;
export type AdminCreateStudentInput = z.infer<typeof adminCreateStudentSchema>;
export type PublicStudentRegisterInput = z.infer<typeof publicStudentRegisterSchema>;
export type UpdateStudentInput = z.infer<typeof updateStudentSchema>;
