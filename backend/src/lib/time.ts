/**
 * School-timezone date/time helpers.
 *
 * Timestamps are stored as UTC `Date` objects; every date/time-of-day
 * calculation that is user-visible goes through the school timezone
 * (settings.timezone, default Asia/Hong_Kong).
 */
import type { AttendanceStatus } from '@prisma/client';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const formatterCache = new Map<string, Intl.DateTimeFormat>();

export interface SchoolParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function isValidTimezone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export function getSchoolParts(date: Date, timeZone: string): SchoolParts {
  const parts = getFormatter(timeZone).formatToParts(date);
  const values: Record<string, string> = {};
  for (const part of parts) values[part.type] = part.value;
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

/** `YYYY-MM-DD` for the given instant in the school timezone. */
export function toSchoolDateString(date: Date, timeZone: string): string {
  const parts = getSchoolParts(date, timeZone);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

/** ISO-8601 timestamp with the school-timezone offset, e.g. 2025-03-03T08:04:11+08:00. */
export function toSchoolIso(date: Date | null | undefined, timeZone: string): string | null {
  if (!date || Number.isNaN(date.getTime())) return null;
  const parts = getSchoolParts(date, timeZone);
  const asUtcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  const truncatedMs = Math.floor(date.getTime() / 1000) * 1000;
  const offsetMinutes = Math.round((asUtcMs - truncatedMs) / 60_000);
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const offset = `${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}T${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}${offset}`;
}

/** Prisma DATE columns arrive as a Date at UTC midnight; expose them as YYYY-MM-DD. */
export function dateOnlyToString(date: Date | null | undefined): string | null {
  if (!date) return null;
  return date.toISOString().slice(0, 10);
}

export function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function isValidDateOnly(value: string): boolean {
  if (!DATE_ONLY_RE.test(value)) return false;
  const parsed = parseDateOnly(value);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === value;
}

export function addDays(dateString: string, days: number): string {
  const date = parseDateOnly(dateString);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Inclusive number of calendar days between two YYYY-MM-DD strings. */
export function inclusiveDaySpan(from: string, to: string): number {
  return Math.round((parseDateOnly(to).getTime() - parseDateOnly(from).getTime()) / 86_400_000) + 1;
}

/** Inclusive list of YYYY-MM-DD dates. Callers must bound the range. */
export function eachDate(from: string, to: string): string[] {
  const dates: string[] = [];
  let cursor = from;
  let guard = 0;
  while (cursor <= to) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
    guard += 1;
    if (guard > 400) throw new Error('Date range too large');
  }
  return dates;
}

/** ISO weekday (1 = Monday ... 7 = Sunday) of a YYYY-MM-DD string. */
export function isoWeekday(dateString: string): number {
  const day = parseDateOnly(dateString).getUTCDay();
  return day === 0 ? 7 : day;
}

export function isSchoolDay(dateString: string, schoolDays: readonly number[]): boolean {
  return schoolDays.includes(isoWeekday(dateString));
}

export function schoolDayCount(from: string, to: string, schoolDays: readonly number[]): number {
  return eachDate(from, to).filter((date) => isSchoolDay(date, schoolDays)).length;
}

export function isValidHhMm(value: string): boolean {
  return HHMM_RE.test(value);
}

export function parseHhMm(value: string): number {
  const [hours, minutes] = value.split(':');
  return Number(hours) * 60 + Number(minutes);
}

/**
 * Minutes past (dayStartTime + lateGraceMinutes) in the school timezone.
 * Returns 0 when the student is on time. A late arrival is at least 1 minute.
 */
export function lateMinutesFor(
  checkIn: Date,
  timeZone: string,
  dayStartTime: string,
  lateGraceMinutes: number,
): number {
  const parts = getSchoolParts(checkIn, timeZone);
  const arrivalMinutes = parts.hour * 60 + parts.minute + parts.second / 60;
  const thresholdMinutes = parseHhMm(dayStartTime) + lateGraceMinutes;
  const diff = arrivalMinutes - thresholdMinutes;
  if (diff <= 0) return 0;
  return Math.max(1, Math.floor(diff));
}

export function attendanceStatusFor(
  checkIn: Date,
  timeZone: string,
  dayStartTime: string,
  lateGraceMinutes: number,
): { status: Extract<AttendanceStatus, 'PRESENT' | 'LATE'>; lateMinutes: number } {
  const lateMinutes = lateMinutesFor(checkIn, timeZone, dayStartTime, lateGraceMinutes);
  return lateMinutes > 0
    ? { status: 'LATE', lateMinutes }
    : { status: 'PRESENT', lateMinutes: 0 };
}

/** schoolDays is stored as JSON; fall back to Mon-Fri for malformed values. */
export function parseSchoolDays(raw: unknown): number[] {
  if (Array.isArray(raw)) {
    const days = raw.filter(
      (value): value is number =>
        typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 7,
    );
    if (days.length > 0) return [...new Set(days)].sort((a, b) => a - b);
  }
  return [1, 2, 3, 4, 5];
}

export interface LateSettings {
  timezone: string;
  dayStartTime: string;
  lateGraceMinutes: number;
}

export function attendanceStatusFromSettings(
  checkIn: Date,
  settings: LateSettings,
): { status: Extract<AttendanceStatus, 'PRESENT' | 'LATE'>; lateMinutes: number } {
  return attendanceStatusFor(
    checkIn,
    settings.timezone,
    settings.dayStartTime,
    settings.lateGraceMinutes,
  );
}
