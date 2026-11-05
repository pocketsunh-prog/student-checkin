import type { Admin, Student } from './types';

// Client-side session storage.
//
// Trade-off: the JWT is kept in localStorage so the app survives reloads without a
// server session. Unlike an httpOnly cookie, localStorage is readable by JavaScript,
// so an XSS bug could exfiltrate the token. Mitigations: React escapes rendered text
// by default, no `dangerouslySetInnerHTML` is used with user data, a strict CSP should
// be added at the reverse proxy in production, and tokens expire after 12h.
// A production hardening step would be a Next.js route-handler BFF that keeps the JWT
// in an httpOnly, SameSite cookie instead. This is documented in README.md.

const ADMIN_TOKEN_KEY = 'checkin.admin.token';
const ADMIN_USER_KEY = 'checkin.admin.user';
const STUDENT_TOKEN_KEY = 'checkin.student.token';
const STUDENT_STUDENT_KEY = 'checkin.student.student';

export const SESSION_EVENT = 'checkin:session-change';
export const UNAUTHORIZED_EVENT = 'checkin:unauthorized';

function read(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage full / disabled — the session simply will not persist.
  }
}

function remove(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function emitSessionChange(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(SESSION_EVENT));
}

export interface AdminSession {
  token: string;
  user: Admin;
}

export function getAdminToken(): string | null {
  return read(ADMIN_TOKEN_KEY);
}

export function getAdminSession(): AdminSession | null {
  const token = read(ADMIN_TOKEN_KEY);
  const rawUser = read(ADMIN_USER_KEY);
  if (!token) return null;
  let user: Admin | null = null;
  if (rawUser) {
    try {
      user = JSON.parse(rawUser) as Admin;
    } catch {
      user = null;
    }
  }
  if (!user) return null;
  return { token, user };
}

export function setAdminSession(token: string, user: Admin): void {
  write(ADMIN_TOKEN_KEY, token);
  write(ADMIN_USER_KEY, JSON.stringify(user));
  emitSessionChange();
}

export function clearAdminSession(): void {
  remove(ADMIN_TOKEN_KEY);
  remove(ADMIN_USER_KEY);
  emitSessionChange();
}

export interface StudentSession {
  token: string;
  student: Student;
}

export function getStudentToken(): string | null {
  return read(STUDENT_TOKEN_KEY);
}

export function getStudentSession(): StudentSession | null {
  const token = read(STUDENT_TOKEN_KEY);
  const rawStudent = read(STUDENT_STUDENT_KEY);
  if (!token) return null;
  let student: Student | null = null;
  if (rawStudent) {
    try {
      student = JSON.parse(rawStudent) as Student;
    } catch {
      student = null;
    }
  }
  if (!student) return null;
  return { token, student };
}

export function setStudentSession(token: string, student: Student): void {
  write(STUDENT_TOKEN_KEY, token);
  write(STUDENT_STUDENT_KEY, JSON.stringify(student));
  emitSessionChange();
}

export function clearStudentSession(): void {
  remove(STUDENT_TOKEN_KEY);
  remove(STUDENT_STUDENT_KEY);
  emitSessionChange();
}

/** Clears every stored session (used by "sign out" in both portals). */
export function clearAllSessions(): void {
  clearAdminSession();
  clearStudentSession();
}
