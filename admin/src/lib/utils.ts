import type { Admin, Student, StudentStatus, AttendanceStatus } from './types';

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toISODate(d);
}

export function startOfMonthISO(): string {
  const d = new Date();
  return toISODate(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function endOfMonthISO(): string {
  const d = new Date();
  return toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

/** Parse a `YYYY-MM-DD` value as a *local* date (avoids UTC off-by-one). */
export function parseISODate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** `2025-03-03` -> `3 Mar 2025` */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = value.length === 10 ? parseISODate(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** `2025-03-03` -> `Mon, 3 Mar` */
export function formatShortDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = value.length === 10 ? parseISODate(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** ISO timestamp -> `08:03` (browser local time). */
export function formatTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** ISO timestamp -> `3 Mar 2025, 08:03` */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** ISO timestamp -> `HH:mm` suitable for an <input type="time">. */
export function isoToTimeInput(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** Combines a local date (`YYYY-MM-DD`) and time (`HH:mm`) into an ISO timestamp. */
export function dateAndTimeToISO(date: string, time: string): string {
  if (!date) return '';
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = (time || '00:00').split(':').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0).toISOString();
}

export function relativeTime(value: string | null | undefined): string {
  if (!value) return 'never';
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return 'never';
  const diff = Math.round((Date.now() - then) / 1000);
  if (diff < 10) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return formatDate(value);
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function fullName(first?: string, last?: string): string {
  return [first, last].filter(Boolean).join(' ').trim();
}

export function titleCase(value: string | null | undefined): string {
  if (!value) return '—';
  return value
    .toLowerCase()
    .split(/[_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export interface StatusTone {
  label: string;
  className: string;
  dot: string;
}

export function statusTone(status: AttendanceStatus | null | undefined): StatusTone {
  switch (status) {
    case 'PRESENT':
      return {
        label: 'Present',
        className: 'border-brand-200 bg-brand-50 text-brand-700',
        dot: 'bg-brand-500',
      };
    case 'LATE':
      return {
        label: 'Late',
        className: 'border-amber-200 bg-amber-50 text-amber-700',
        dot: 'bg-amber-500',
      };
    case 'ABSENT':
      return {
        label: 'Absent',
        className: 'border-rose-200 bg-rose-50 text-rose-700',
        dot: 'bg-rose-500',
      };
    default:
      return {
        label: 'No record',
        className: 'border-slate-200 bg-slate-50 text-slate-500',
        dot: 'bg-slate-300',
      };
  }
}

export function studentStatusTone(status: StudentStatus | null | undefined): StatusTone {
  return status === 'INACTIVE'
    ? {
        label: 'Inactive',
        className: 'border-slate-200 bg-slate-100 text-slate-600',
        dot: 'bg-slate-400',
      }
    : {
        label: 'Active',
        className: 'border-brand-200 bg-brand-50 text-brand-700',
        dot: 'bg-brand-500',
      };
}

export function scanActionLabel(action: string): string {
  switch (action) {
    case 'CHECK_IN':
      return 'Checked in';
    case 'CHECK_OUT':
      return 'Checked out';
    case 'ALREADY_CHECKED_IN':
      return 'Already in';
    case 'ALREADY_CHECKED_OUT':
      return 'Already out';
    default:
      return titleCase(action);
  }
}

export function percent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return `${Number(value).toFixed(digits)}%`;
}

export function rateTone(rate: number): string {
  if (rate >= 95) return 'text-brand-600';
  if (rate >= 85) return 'text-amber-600';
  return 'text-rose-600';
}

export function displayName(person: { fullName?: string; firstName?: string; lastName?: string }): string {
  return person.fullName || fullName(person.firstName, person.lastName) || 'Unknown';
}

export function adminDisplayName(admin: Admin | null | undefined): string {
  return admin?.name || admin?.email || 'Administrator';
}

export function studentDisplayName(student: Student | null | undefined): string {
  return student ? displayName(student) : 'Student';
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function debounce<Args extends unknown[]>(
  fn: (...args: Args) => void,
  ms = 350,
): (...args: Args) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Something went wrong. Please try again.';
}

/** School weekdays (ISO 1=Mon … 7=Sun) rendered in calendar order. */
export const WEEKDAYS: Array<{ value: number; short: string; label: string }> = [
  { value: 1, short: 'Mon', label: 'Monday' },
  { value: 2, short: 'Tue', label: 'Tuesday' },
  { value: 3, short: 'Wed', label: 'Wednesday' },
  { value: 4, short: 'Thu', label: 'Thursday' },
  { value: 5, short: 'Fri', label: 'Friday' },
  { value: 6, short: 'Sat', label: 'Saturday' },
  { value: 7, short: 'Sun', label: 'Sunday' },
];

export const SEX_OPTIONS: Array<{ value: 'MALE' | 'FEMALE' | 'OTHER'; label: string }> = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER', label: 'Other' },
];

export const TIMEZONES = [
  'Asia/Hong_Kong',
  'Asia/Singapore',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Kolkata',
  'Australia/Sydney',
  'Europe/London',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
];
