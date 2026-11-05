'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, apiErrorMessage } from '@/lib/api';
import { clearStudentSession, getStudentSession, setStudentSession } from '@/lib/auth';
import { useStudentSession } from '@/lib/use-session';
import type { Student, StudentAttendanceResponse, StudentAuthResponse } from '@/lib/types';
import {
  cn,
  displayName,
  formatDate,
  formatTime,
  percent,
  startOfMonthISO,
  todayISO,
} from '@/lib/utils';
import { useToast } from '@/lib/toast';
import {
  AlertIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  EyeIcon,
  EyeOffIcon,
  GraduationCapIcon,
  LockIcon,
  LogoutIcon,
  RefreshIcon,
  UserIcon,
} from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { AttendanceBadge } from '@/components/ui/badge';
import { EmptyState, ErrorState, FullPageLoader, InlineAlert, LoadingState } from '@/components/ui/states';
import { TBody, TD, TH, THead, TableContainer, TableEmpty } from '@/components/ui/table';
import { UserAvatar } from '@/components/ui/avatar';
import { FaceEnrollPanel } from '@/components/students/face-enroll-panel';

export default function StudentPortalPage() {
  const { session, loading } = useStudentSession();

  if (loading) return <FullPageLoader label="Loading student portal…" />;
  if (!session) return <StudentLogin />;
  return <StudentHome initialStudent={session.student} />;
}

/* ------------------------------------------------------------------ */
/* Login                                                               */
/* ------------------------------------------------------------------ */

function StudentLogin() {
  const router = useRouter();
  const toast = useToast();
  const [studentId, setStudentId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If another tab signs in, move straight into the portal.
  useEffect(() => {
    if (getStudentSession()) router.replace('/student');
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await api.post<StudentAuthResponse>(
        '/auth/student/login',
        { studentId: studentId.trim(), password },
        { auth: 'none', redirectOnUnauthorized: false },
      );
      setStudentSession(data.token, data.student);
      toast.success(`Welcome, ${data.student.fullName}`, 'You are signed in to the student portal.');
    } catch (loginError) {
      setError(apiErrorMessage(loginError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/login" className="focus-ring flex items-center gap-2.5 rounded-lg">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-950 text-brand-400">
              <GraduationCapIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-bold leading-tight text-slate-900">SchoolCheck</p>
              <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Student portal</p>
            </div>
          </Link>
          <Link href="/login" className="focus-ring rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
            Admin sign in
          </Link>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card sm:p-8">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <UserIcon className="h-6 w-6" />
            </div>
            <h1 className="mt-4 text-xl font-bold tracking-tight text-slate-900">Student sign in</h1>
            <p className="mt-1 text-sm text-slate-500">View your attendance history and manage your face photo.</p>

            {error ? (
              <div className="mt-4">
                <InlineAlert variant="error">{error}</InlineAlert>
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
              <Field label="Student ID" htmlFor="student-login-id" required>
                <Input
                  id="student-login-id"
                  value={studentId}
                  onChange={(event) => setStudentId(event.target.value)}
                  placeholder="STU001"
                  autoComplete="username"
                  icon={<UserIcon className="h-4 w-4" />}
                  required
                  disabled={loading}
                />
              </Field>
              <Field label="Password" htmlFor="student-login-password" required>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
                    <LockIcon className="h-4 w-4" />
                  </span>
                  <input
                    id="student-login-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    required
                    disabled={loading}
                    className="field-input pl-10 pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    className="focus-ring absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-slate-400 hover:text-slate-600"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                  </button>
                </div>
              </Field>

              <Button type="submit" size="lg" fullWidth loading={loading}>
                Sign in
              </Button>
            </form>

            <div className="mt-5 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
              <p className="font-semibold text-slate-500">Demo students</p>
              <p className="mt-0.5 font-mono">STU001–STU012 · Student@12345</p>
            </div>

            <p className="mt-5 text-center text-sm text-slate-500">
              New student?{' '}
              <Link href="/register" className="focus-ring rounded font-semibold text-brand-700 underline-offset-2 hover:underline">
                Register here
              </Link>
            </p>
          </div>
          <p className="mt-5 text-center text-xs text-slate-400">
            Need help? Contact the school office. Face data can be re-enrolled by an administrator.
          </p>
        </div>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Portal                                                              */
/* ------------------------------------------------------------------ */

function StudentHome({ initialStudent }: { initialStudent: Student }) {
  const router = useRouter();
  const toast = useToast();

  const [profile, setProfile] = useState<Student>(initialStudent);
  const [from, setFrom] = useState(startOfMonthISO());
  const [to, setTo] = useState(todayISO());
  const [attendance, setAttendance] = useState<StudentAttendanceResponse | null>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(true);
  const [attendanceError, setAttendanceError] = useState<string | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  const refreshProfile = useCallback(async () => {
    try {
      const result = await api.get<Student>('/student/profile', undefined, { auth: 'student' });
      setProfile(result);
      const session = getStudentSession();
      if (session) setStudentSession(session.token, result);
    } catch {
      // Keep showing the cached profile; the auth layer handles 401.
    }
  }, []);

  const loadAttendance = useCallback(async () => {
    setAttendanceLoading(true);
    setAttendanceError(null);
    try {
      const result = await api.get<StudentAttendanceResponse>(
        '/student/attendance',
        { from, to },
        { auth: 'student' },
      );
      setAttendance(result);
    } catch (loadError) {
      setAttendanceError(apiErrorMessage(loadError));
    } finally {
      setAttendanceLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  useEffect(() => {
    void loadAttendance();
  }, [loadAttendance]);

  function logout() {
    clearStudentSession();
    toast.info('Signed out', 'You have been signed out of the student portal.');
    router.replace('/student');
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);
    if (newPassword.length < 8) {
      setPasswordError('Your new password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('The new passwords do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError('Choose a password that is different from your current one.');
      return;
    }
    setSavingPassword(true);
    try {
      await api.post('/auth/student/change-password', { currentPassword, newPassword }, { auth: 'student' });
      setPasswordSuccess('Password changed successfully.');
      toast.success('Password changed', 'Use your new password next time you sign in.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (changeError) {
      setPasswordError(apiErrorMessage(changeError));
    } finally {
      setSavingPassword(false);
    }
  }

  const summary = attendance?.summary;
  const items = attendance?.items ?? [];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-950 text-brand-400">
              <GraduationCapIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-bold leading-tight text-slate-900">SchoolCheck</p>
              <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Student portal</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-semibold leading-tight text-slate-900">{displayName(profile)}</p>
              <p className="font-mono text-[11px] text-slate-500">{profile.studentId}</p>
            </div>
            <UserAvatar name={displayName(profile)} photoUrl={profile.photoUrl} auth="student" size="md" />
            <Button variant="outline" size="sm" onClick={logout} leftIcon={<LogoutIcon className="h-4 w-4" />}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-6 lg:py-8">
        <Card className="overflow-hidden">
          <div className="h-20 bg-gradient-to-r from-navy-950 via-navy-800 to-brand-700" aria-hidden="true" />
          <div className="px-5 pb-5 sm:px-6">
            <div className="-mt-10 flex flex-wrap items-end justify-between gap-4">
              <div className="flex items-end gap-4">
                <div className="rounded-full bg-white p-1 shadow-card">
                  <UserAvatar name={displayName(profile)} photoUrl={profile.photoUrl} auth="student" size="xl" />
                </div>
                <div className="pb-1">
                  <h1 className="text-xl font-bold tracking-tight text-slate-900">{displayName(profile)}</h1>
                  <p className="text-xs text-slate-500">
                    <span className="font-mono">{profile.studentId}</span> · Class {profile.class} · {profile.form}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 pb-1">
                {profile.faceEnrolled ? (
                  <Badge tone="brand" dot>
                    Face enrolled
                  </Badge>
                ) : (
                  <Badge tone="amber" dot>
                    Face not enrolled
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniStat label="Present" value={summary?.present} tone="brand" icon={<CheckCircleIcon className="h-4 w-4" />} loading={attendanceLoading && !attendance} />
          <MiniStat label="Late" value={summary?.late} tone="amber" icon={<ClockIcon className="h-4 w-4" />} loading={attendanceLoading && !attendance} />
          <MiniStat label="Absent" value={summary?.absent} tone="rose" icon={<AlertIcon className="h-4 w-4" />} loading={attendanceLoading && !attendance} />
          <MiniStat
            label="Checked out"
            value={summary?.checkedOut}
            tone="sky"
            icon={<CalendarIcon className="h-4 w-4" />}
            loading={attendanceLoading && !attendance}
          />
        </div>

        <Card>
          <CardHeader
            title="My attendance"
            description="Check-ins and check-outs recorded by the gate kiosk"
            actions={
              <Button variant="outline" size="sm" onClick={() => void loadAttendance()} loading={attendanceLoading} leftIcon={<RefreshIcon className="h-4 w-4" />}>
                Refresh
              </Button>
            }
          />
          <CardContent className="pb-0">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="From" htmlFor="student-from">
                <Input
                  id="student-from"
                  type="date"
                  value={from}
                  max={todayISO()}
                  onChange={(event) => setFrom(event.target.value)}
                />
              </Field>
              <Field label="To" htmlFor="student-to">
                <Input id="student-to" type="date" value={to} max={todayISO()} onChange={(event) => setTo(event.target.value)} />
              </Field>
              <div className="flex items-end gap-2 sm:col-span-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setFrom(startOfMonthISO());
                    setTo(todayISO());
                  }}
                >
                  This month
                </Button>
              </div>
            </div>
          </CardContent>

          {attendanceError ? (
            <ErrorState message={attendanceError} onRetry={() => void loadAttendance()} />
          ) : (
            <TableContainer className="rounded-none border-0 border-t border-slate-100 shadow-none">
              <THead>
                <tr>
                  <TH>Date</TH>
                  <TH>Status</TH>
                  <TH>Check in</TH>
                  <TH>Check out</TH>
                  <TH className="hidden sm:table-cell">Late</TH>
                  <TH className="hidden md:table-cell">Note</TH>
                </tr>
              </THead>
              {attendanceLoading && !attendance ? (
                <TBody>
                  <tr>
                    <td colSpan={6} className="p-0">
                      <LoadingState label="Loading your attendance…" />
                    </td>
                  </tr>
                </TBody>
              ) : items.length === 0 ? (
                <TBody>
                  <TableEmpty
                    colSpan={6}
                    title="No attendance in this range"
                    description="Your check-ins will appear here after you scan at a school kiosk."
                    icon={<CalendarIcon className="h-5 w-5" />}
                  />
                </TBody>
              ) : (
                <TBody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b border-slate-100 last:border-0">
                      <TD>
                        <p className="font-medium text-slate-800">{formatDate(item.date)}</p>
                      </TD>
                      <TD>
                        <AttendanceBadge status={item.status} />
                      </TD>
                      <TD className="tabular">{formatTime(item.checkInAt)}</TD>
                      <TD className="tabular">{formatTime(item.checkOutAt)}</TD>
                      <TD className="hidden sm:table-cell">
                        {item.lateMinutes > 0 ? <span className="font-medium text-amber-700">{item.lateMinutes} min</span> : '—'}
                      </TD>
                      <TD className="hidden md:table-cell">
                        <span className="block max-w-[220px] truncate text-xs text-slate-500">{item.note || '—'}</span>
                      </TD>
                    </tr>
                  ))}
                </TBody>
              )}
            </TableContainer>
          )}
          <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">
            {summary
              ? `Attendance rate this range: ${percent(
                  summary.present + summary.late + summary.absent > 0
                    ? ((summary.present + summary.late) / (summary.present + summary.late + summary.absent)) * 100
                    : 0,
                )}`
              : 'Attendance summary unavailable.'}
          </div>
        </Card>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader title="Face photo" description="Used to recognise you at the kiosk." />
            <CardContent>
              <FaceEnrollPanel
                enrollPath="/student/enroll-face"
                faceEnrolled={Boolean(profile.faceEnrolled)}
                auth="student"
                onEnrolled={() => void refreshProfile()}
                actionLabel={profile.faceEnrolled ? 'Re-enrol my face' : 'Enrol my face'}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Change password" description="Keep your account secure." />
            <CardContent>
              <form onSubmit={changePassword} className="space-y-4" noValidate>
                {passwordError ? <InlineAlert variant="error">{passwordError}</InlineAlert> : null}
                {passwordSuccess ? <InlineAlert variant="success">{passwordSuccess}</InlineAlert> : null}
                <Field label="Current password" htmlFor="student-current-password" required>
                  <Input
                    id="student-current-password"
                    type="password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </Field>
                <Field label="New password" htmlFor="student-new-password" required hint="At least 8 characters.">
                  <Input
                    id="student-new-password"
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </Field>
                <Field label="Confirm new password" htmlFor="student-confirm-password" required>
                  <Input
                    id="student-confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </Field>
                <Button type="submit" loading={savingPassword} leftIcon={<LockIcon className="h-4 w-4" />}>
                  Update password
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <p className="px-1 text-xs text-slate-400">
          Face data is used only for attendance. Ask the school office if you need your face re-enrolled or removed.
        </p>
      </main>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
  icon,
  loading,
}: {
  label: string;
  value: number | undefined;
  tone: 'brand' | 'amber' | 'rose' | 'sky';
  icon: React.ReactNode;
  loading: boolean;
}) {
  const tones = {
    brand: 'bg-brand-50 text-brand-600',
    amber: 'bg-amber-50 text-amber-600',
    rose: 'bg-rose-50 text-rose-600',
    sky: 'bg-sky-50 text-sky-600',
  } as const;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-card">
      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', tones[tone])}>{icon}</span>
      <div>
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <p className="text-lg font-bold leading-tight text-slate-900 tabular">
          {loading ? <span className="inline-block h-5 w-6 animate-pulse rounded bg-slate-200" /> : (value ?? '—')}
        </p>
      </div>
    </div>
  );
}
