// Shared API types — kept in sync with docs/API.md (API Contract v1).

export type Sex = 'MALE' | 'FEMALE' | 'OTHER';
export type StudentStatus = 'ACTIVE' | 'INACTIVE';
export type AttendanceStatus = 'PRESENT' | 'LATE' | 'ABSENT';
export type AttendanceMethod = 'FACE' | 'MANUAL';
export type ScanAction = 'CHECK_IN' | 'CHECK_OUT' | 'ALREADY_CHECKED_IN' | 'ALREADY_CHECKED_OUT';
export type AdminRole = 'SUPER_ADMIN' | 'ADMIN';
export type ActorType = 'admin' | 'student';

export interface Admin {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
}

export interface Student {
  studentId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  dob: string;
  sex: Sex;
  class: string;
  form: string;
  faceEnrolled: boolean;
  status?: StudentStatus;
  photoUrl?: string;
  createdAt?: string;
}

export interface StudentListRow extends Student {
  status: StudentStatus;
  todayStatus: AttendanceStatus | null;
}

export interface Pagination<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AttendanceSummary {
  totalStudents: number;
  present: number;
  late: number;
  absent: number;
  checkedOut: number;
  checkInRate: number;
}

export interface AttendanceRow {
  id: string | null;
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

export interface AttendanceListResponse extends Pagination<AttendanceRow> {
  summary?: AttendanceSummary;
}

export interface StudentAttendanceItem {
  id: string;
  date: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  status: AttendanceStatus;
  lateMinutes: number;
  note: string | null;
}

export interface StudentAttendanceResponse {
  items: StudentAttendanceItem[];
  summary: {
    present: number;
    late: number;
    absent: number;
    checkedOut: number;
  };
}

export interface RecentScan {
  studentId: string;
  fullName: string;
  action: ScanAction;
  status: AttendanceStatus;
  at: string;
  device: string;
}

export interface TrendPoint {
  date: string;
  late: number;
  present: number;
  absent: number;
}

export interface DashboardData {
  date: string;
  stats: AttendanceSummary;
  recentScans: RecentScan[];
  lateTrend: TrendPoint[];
}

export interface DayReportRow {
  date: string;
  present: number;
  late: number;
  absent: number;
  total: number;
}

export interface StudentReportRow {
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
  totals: {
    studentDays: number;
    present: number;
    late: number;
    absent: number;
    attendanceRate: number;
  };
  days: DayReportRow[];
  students: StudentReportRow[];
}

export interface Device {
  id: string;
  name: string;
  location: string;
  active: boolean;
  lastSeenAt: string | null;
  online: boolean;
  apiKeyPrefix: string;
  createdAt: string;
}

export interface Settings {
  schoolName: string;
  dayStartTime: string;
  lateGraceMinutes: number;
  timezone: string;
  faceMatchThreshold: number;
  schoolDays: number[];
}

export interface MetaOptions {
  classes: string[];
  forms: string[];
}

export interface AdminLoginResponse {
  token: string;
  user: Admin;
}

export interface StudentAuthResponse {
  token: string;
  student: Student;
}

export interface StudentDetailResponse {
  student: Student;
  recentAttendance: AttendanceRow[];
}

export interface CreateStudentResponse {
  student: Student;
  initialPassword?: string;
}

export interface ResetPasswordResponse {
  studentId: string;
  temporaryPassword: string;
}

export interface DeviceListResponse {
  items: Device[];
}

export interface DeviceWithKey {
  device: Device;
  apiKey: string;
}

export interface MeResponse {
  actorType: ActorType;
  user: Admin | Student;
}

export interface HealthResponse {
  status: string;
  db: string;
  faceService: string;
  uptimeSeconds: number;
}
