import type {
  Admin,
  Attendance,
  AttendanceMethod,
  AttendanceStatus,
  Device,
  Settings,
  Student,
  StudentStatus,
} from '@prisma/client';
import { dateOnlyToString, toSchoolIso, parseSchoolDays } from './time';

export type StudentSummary = Pick<
  Student,
  'studentId' | 'firstName' | 'lastName' | 'class' | 'form'
>;

export type TodayStatus = AttendanceStatus | 'ABSENT' | null;

export interface StudentDto {
  studentId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  dob: string;
  sex: string;
  class: string;
  form: string;
  faceEnrolled: boolean;
  status: StudentStatus;
  /** null when the student has no stored photo (avoids pointless 404 fetches). */
  photoUrl: string | null;
  createdAt: string;
  todayStatus?: TodayStatus;
}

export interface AdminDto {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface AttendanceDto {
  id: string;
  studentId: string;
  fullName: string;
  class: string;
  form: string;
  date: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  status: AttendanceStatus;
  lateMinutes: number;
  method: AttendanceMethod;
  note: string | null;
  checkedOut: boolean;
}

export interface KioskStudentDto {
  studentId: string;
  fullName: string;
  class: string;
  form: string;
  photoUrl: string | null;
}

export interface KioskAttendanceDto {
  id: string;
  date: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  status: AttendanceStatus;
  lateMinutes: number;
}

export interface DeviceDto {
  id: string;
  name: string;
  location: string;
  active: boolean;
  lastSeenAt: string | null;
  online: boolean;
  apiKeyPrefix: string;
  createdAt: string;
}

export interface SettingsDto {
  schoolName: string;
  dayStartTime: string;
  lateGraceMinutes: number;
  timezone: string;
  faceMatchThreshold: number;
  schoolDays: number[];
}

export interface Pagination<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export const ONLINE_WINDOW_MS = 2 * 60 * 1000;

export function fullName(student: Pick<Student, 'firstName' | 'lastName'>): string {
  return `${student.firstName} ${student.lastName}`;
}

export function photoUrlFor(studentId: string): string {
  return `/api/students/${encodeURIComponent(studentId)}/photo`;
}

export function studentToDto(
  student: Student,
  timeZone: string,
  todayStatus?: TodayStatus,
): StudentDto {
  return {
    studentId: student.studentId,
    firstName: student.firstName,
    lastName: student.lastName,
    fullName: fullName(student),
    dob: dateOnlyToString(student.dob) ?? '',
    sex: student.sex,
    class: student.class,
    form: student.form,
    faceEnrolled: student.faceDescriptor !== null && student.faceDescriptor !== undefined,
    status: student.status,
    photoUrl: student.photoPath ? photoUrlFor(student.studentId) : null,
    createdAt: toSchoolIso(student.createdAt, timeZone) ?? student.createdAt.toISOString(),
    ...(todayStatus !== undefined ? { todayStatus } : {}),
  };
}

export function adminToDto(admin: Pick<Admin, 'id' | 'email' | 'name' | 'role'>): AdminDto {
  return {
    id: admin.id.toString(),
    email: admin.email,
    name: admin.name,
    role: admin.role,
  };
}

export function attendanceToDto(
  row: Attendance & { student: StudentSummary },
  timeZone: string,
): AttendanceDto {
  return {
    id: row.id.toString(),
    studentId: row.studentId,
    fullName: fullName(row.student),
    class: row.student.class,
    form: row.student.form,
    date: dateOnlyToString(row.date) ?? '',
    checkInAt: toSchoolIso(row.checkInAt, timeZone),
    checkOutAt: toSchoolIso(row.checkOutAt, timeZone),
    status: row.status,
    lateMinutes: row.lateMinutes,
    method: row.method,
    note: row.note,
    checkedOut: row.checkOutAt !== null,
  };
}

export function absentAttendanceToDto(
  student: StudentSummary,
  dateString: string,
): AttendanceDto {
  return {
    id: `absent:${student.studentId}:${dateString}`,
    studentId: student.studentId,
    fullName: fullName(student),
    class: student.class,
    form: student.form,
    date: dateString,
    checkInAt: null,
    checkOutAt: null,
    status: 'ABSENT',
    lateMinutes: 0,
    method: 'MANUAL',
    note: null,
    checkedOut: false,
  };
}

export function kioskStudentToDto(student: Student): KioskStudentDto {
  return {
    studentId: student.studentId,
    fullName: fullName(student),
    class: student.class,
    form: student.form,
    photoUrl: student.photoPath ? photoUrlFor(student.studentId) : null,
  };
}

export function kioskAttendanceToDto(
  row: Attendance,
  timeZone: string,
): KioskAttendanceDto {
  return {
    id: row.id.toString(),
    date: dateOnlyToString(row.date) ?? '',
    checkInAt: toSchoolIso(row.checkInAt, timeZone),
    checkOutAt: toSchoolIso(row.checkOutAt, timeZone),
    status: row.status,
    lateMinutes: row.lateMinutes,
  };
}

export function deviceToDto(device: Device, at: Date, timeZone: string): DeviceDto {
  const online =
    device.lastSeenAt !== null && at.getTime() - device.lastSeenAt.getTime() <= ONLINE_WINDOW_MS;
  return {
    id: device.id,
    name: device.name,
    location: device.location,
    active: device.active,
    lastSeenAt: toSchoolIso(device.lastSeenAt, timeZone),
    online,
    apiKeyPrefix: device.apiKeyPrefix,
    createdAt: toSchoolIso(device.createdAt, timeZone) ?? device.createdAt.toISOString(),
  };
}

export function settingsToDto(settings: Settings): SettingsDto {
  return {
    schoolName: settings.schoolName,
    dayStartTime: settings.dayStartTime,
    lateGraceMinutes: settings.lateGraceMinutes,
    timezone: settings.timezone,
    faceMatchThreshold: settings.faceMatchThreshold,
    schoolDays: parseSchoolDays(settings.schoolDays),
  };
}
