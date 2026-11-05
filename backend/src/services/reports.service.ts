import type { AttendanceStatus, ScanAction } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { errors } from '../lib/errors';
import { now } from '../lib/clock';
import { round } from '../lib/http';
import {
  addDays,
  dateOnlyToString,
  eachDate,
  inclusiveDaySpan,
  isSchoolDay,
  isValidDateOnly,
  parseDateOnly,
  parseSchoolDays,
  toSchoolDateString,
  toSchoolIso,
} from '../lib/time';
import { fullName } from '../lib/dto';
import { getSettings } from './settings.service';
import type { ReportQueryInput } from '../lib/schemas';

const MAX_RANGE_DAYS = 366;
const DASHBOARD_TREND_DAYS = 7;

export interface ReportTotals {
  studentDays: number;
  present: number;
  late: number;
  absent: number;
  attendanceRate: number;
}

export interface ReportDay {
  date: string;
  present: number;
  late: number;
  absent: number;
  total: number;
}

export interface ReportStudent {
  studentId: string;
  fullName: string;
  class: string;
  form: string;
  present: number;
  late: number;
  absent: number;
}

export interface ReportSummary {
  from: string;
  to: string;
  totals: ReportTotals;
  days: ReportDay[];
  students: ReportStudent[];
}

/**
 * Report aggregation over active students and school days only:
 * - studentDays = sum of school days in range since each student's enrollment
 * - absent is derived (no stored ABSENT rows required) and never back-dated
 *   before Student.createdAt's school date
 * - attendanceRate = (present + late) / studentDays
 */
export async function getReportSummary(query: ReportQueryInput): Promise<ReportSummary> {
  const { from, to } = query;
  if (from > to) {
    throw errors.validation('`from` must be on or before `to`', { from: ['Must be on or before `to`'] });
  }
  if (inclusiveDaySpan(from, to) > MAX_RANGE_DAYS) {
    throw errors.validation(`Date range must be ${MAX_RANGE_DAYS} days or fewer`);
  }

  const settings = await getSettings();
  const schoolDays = parseSchoolDays(settings.schoolDays);
  const dates = eachDate(from, to).filter((date) => isSchoolDay(date, schoolDays));
  const dateSet = new Set(dates);

  const studentWhere = {
    status: 'ACTIVE' as const,
    ...(query.class ? { class: query.class } : {}),
    ...(query.form ? { form: query.form } : {}),
  };

  const students = await prisma.student.findMany({
    where: studentWhere,
    select: {
      studentId: true,
      firstName: true,
      lastName: true,
      class: true,
      form: true,
      createdAt: true,
    },
    orderBy: [{ class: 'asc' }, { lastName: 'asc' }, { firstName: 'asc' }, { studentId: 'asc' }],
  });

  // A student can only be absent from school days on/after they enrolled.
  const enrolledOn = new Map(
    students.map((student) => [
      student.studentId,
      toSchoolDateString(student.createdAt, settings.timezone),
    ]),
  );
  const effectiveDays = new Map<string, number>(
    students.map((student) => {
      const firstDay = enrolledOn.get(student.studentId)!;
      return [student.studentId, dates.filter((date) => date >= firstDay).length];
    }),
  );

  const rows =
    students.length === 0
      ? []
      : await prisma.attendance.findMany({
          where: {
            studentId: { in: students.map((student) => student.studentId) },
            date: { gte: parseDateOnly(from), lte: parseDateOnly(to) },
            status: { in: ['PRESENT', 'LATE'] },
          },
          select: { studentId: true, date: true, status: true },
        });

  const dayPresent = new Map<string, number>();
  const dayLate = new Map<string, number>();
  const studentCounts = new Map<string, { present: number; late: number }>();
  for (const student of students) {
    studentCounts.set(student.studentId, { present: 0, late: 0 });
  }

  for (const row of rows) {
    const dateString = dateOnlyToString(row.date);
    if (!dateString || !dateSet.has(dateString)) continue;
    const counts = studentCounts.get(row.studentId);
    if (!counts) continue;
    // Stored rows are only counted from the student's enrollment date onwards.
    if (dateString < (enrolledOn.get(row.studentId) ?? dateString)) continue;
    if (row.status === 'PRESENT') {
      counts.present += 1;
      dayPresent.set(dateString, (dayPresent.get(dateString) ?? 0) + 1);
    } else if (row.status === 'LATE') {
      counts.late += 1;
      dayLate.set(dateString, (dayLate.get(dateString) ?? 0) + 1);
    }
  }

  let present = 0;
  let late = 0;
  let studentDays = 0;
  const studentReports: ReportStudent[] = students.map((student) => {
    const counts = studentCounts.get(student.studentId) ?? { present: 0, late: 0 };
    const totalDays = effectiveDays.get(student.studentId) ?? 0;
    const absent = Math.max(0, totalDays - counts.present - counts.late);
    present += counts.present;
    late += counts.late;
    studentDays += totalDays;
    return {
      studentId: student.studentId,
      fullName: fullName(student),
      class: student.class,
      form: student.form,
      present: counts.present,
      late: counts.late,
      absent,
    };
  });

  const absent = Math.max(0, studentDays - present - late);

  const days: ReportDay[] = dates.map((date) => {
    const dayPresentCount = dayPresent.get(date) ?? 0;
    const dayLateCount = dayLate.get(date) ?? 0;
    const dayTotal = students.filter(
      (student) => (enrolledOn.get(student.studentId) ?? date) <= date,
    ).length;
    return {
      date,
      present: dayPresentCount,
      late: dayLateCount,
      absent: Math.max(0, dayTotal - dayPresentCount - dayLateCount),
      total: dayTotal,
    };
  });

  return {
    from,
    to,
    totals: {
      studentDays,
      present,
      late,
      absent,
      attendanceRate: studentDays > 0 ? round(((present + late) / studentDays) * 100, 2) : 0,
    },
    days,
    students: studentReports,
  };
}

export interface DashboardStats {
  totalStudents: number;
  present: number;
  late: number;
  absent: number;
  checkedOut: number;
  checkInRate: number;
}

export interface DashboardRecentScan {
  studentId: string | null;
  fullName: string;
  action: ScanAction;
  status: AttendanceStatus | null;
  at: string;
  device: string | null;
}

export interface DashboardLateTrendPoint {
  date: string;
  late: number;
  present: number;
  absent: number;
}

export interface DashboardData {
  date: string;
  stats: DashboardStats;
  recentScans: DashboardRecentScan[];
  lateTrend: DashboardLateTrendPoint[];
}

export async function getDashboard(dateQuery?: string): Promise<DashboardData> {
  const settings = await getSettings();
  const timeZone = settings.timezone;
  const schoolDays = parseSchoolDays(settings.schoolDays);

  if (dateQuery !== undefined && !isValidDateOnly(dateQuery)) {
    throw errors.validation('Invalid date', { date: ['Expected YYYY-MM-DD'] });
  }
  const dateString = dateQuery ?? toSchoolDateString(now(), timeZone);
  const trendStart = addDays(dateString, -(DASHBOARD_TREND_DAYS - 1));

  const [activeStudents, rawTodayRows, recentScans, trendRows] = await Promise.all([
    prisma.student.findMany({
      where: { status: 'ACTIVE' },
      select: { studentId: true, createdAt: true },
    }),
    prisma.attendance.findMany({
      where: { date: parseDateOnly(dateString), student: { is: { status: 'ACTIVE' } } },
      select: { studentId: true, status: true, checkOutAt: true },
    }),
    prisma.scanEvent.findMany({
      where: { studentId: { not: null }, action: { in: ['CHECK_IN', 'CHECK_OUT'] } },
      orderBy: [{ createdAt: 'desc' }],
      take: 10,
      include: {
        student: { select: { studentId: true, firstName: true, lastName: true } },
        device: { select: { name: true } },
      },
    }),
    prisma.attendance.findMany({
      where: {
        date: { gte: parseDateOnly(trendStart), lte: parseDateOnly(dateString) },
        student: { is: { status: 'ACTIVE' } },
      },
      select: { date: true, status: true },
    }),
  ]);

  // Students only count towards a date once they have enrolled.
  const enrolledOn = new Map(
    activeStudents.map((student) => [
      student.studentId,
      toSchoolDateString(student.createdAt, timeZone),
    ]),
  );
  const enrolledCountOn = (date: string): number =>
    activeStudents.reduce(
      (count, student) => count + ((enrolledOn.get(student.studentId) ?? date) <= date ? 1 : 0),
      0,
    );

  const todayRows = rawTodayRows.filter(
    (row) => (enrolledOn.get(row.studentId) ?? dateString) <= dateString,
  );
  const totalStudents = enrolledCountOn(dateString);
  const present = todayRows.filter((row) => row.status === 'PRESENT').length;
  const late = todayRows.filter((row) => row.status === 'LATE').length;
  const checkedOut = todayRows.filter((row) => row.checkOutAt !== null).length;
  const schoolDay = isSchoolDay(dateString, schoolDays);
  const absent = schoolDay ? Math.max(0, totalStudents - present - late) : 0;

  // Status for each recent scan, keyed by student/date.
  const scanDates = [...new Set(recentScans.map((scan) => toSchoolDateString(scan.createdAt, timeZone)))];
  const scanStudentIds = [
    ...new Set(recentScans.map((scan) => scan.studentId).filter((id): id is string => id !== null)),
  ];
  const scanStatusRows =
    scanDates.length > 0 && scanStudentIds.length > 0
      ? await prisma.attendance.findMany({
          where: {
            studentId: { in: scanStudentIds },
            date: { in: scanDates.map(parseDateOnly) },
          },
          select: { studentId: true, date: true, status: true },
        })
      : [];
  const scanStatus = new Map(
    scanStatusRows.map((row) => [
      `${row.studentId}|${dateOnlyToString(row.date)}`,
      row.status,
    ]),
  );

  const recentScanDtos: DashboardRecentScan[] = recentScans.map((scan) => {
    const scanDate = toSchoolDateString(scan.createdAt, timeZone);
    return {
      studentId: scan.student?.studentId ?? null,
      fullName: scan.student ? fullName(scan.student) : 'Unknown student',
      action: scan.action,
      status: scan.studentId ? (scanStatus.get(`${scan.studentId}|${scanDate}`) ?? null) : null,
      at: toSchoolIso(scan.createdAt, timeZone) ?? scan.createdAt.toISOString(),
      device: scan.device?.name ?? null,
    };
  });

  const trendCounts = new Map<string, { present: number; late: number }>();
  for (const row of trendRows) {
    const key = dateOnlyToString(row.date);
    if (!key) continue;
    const counts = trendCounts.get(key) ?? { present: 0, late: 0 };
    if (row.status === 'PRESENT') counts.present += 1;
    else if (row.status === 'LATE') counts.late += 1;
    trendCounts.set(key, counts);
  }

  const lateTrend: DashboardLateTrendPoint[] = eachDate(trendStart, dateString).map((date) => {
    const counts = trendCounts.get(date) ?? { present: 0, late: 0 };
    return {
      date,
      late: counts.late,
      present: counts.present,
      absent: isSchoolDay(date, schoolDays)
        ? Math.max(0, enrolledCountOn(date) - counts.present - counts.late)
        : 0,
    };
  });

  return {
    date: dateString,
    stats: {
      totalStudents,
      present,
      late,
      absent,
      checkedOut,
      checkInRate: totalStudents > 0 ? round(((present + late) / totalStudents) * 100, 2) : 0,
    },
    recentScans: recentScanDtos,
    lateTrend,
  };
}
