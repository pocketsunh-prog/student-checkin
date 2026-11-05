'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api, apiErrorMessage } from '@/lib/api';
import type { AttendanceRow, ResetPasswordResponse, Sex, StudentDetailResponse, StudentStatus } from '@/lib/types';
import { SEX_OPTIONS, displayName, formatDate, formatDateTime, formatTime, todayISO } from '@/lib/utils';
import { useToast } from '@/lib/toast';
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  ClockIcon,
  CopyIcon,
  KeyIcon,
  PencilIcon,
  RefreshIcon,
  TrashIcon,
  UserIcon,
} from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { AttendanceBadge, StudentStatusBadge } from '@/components/ui/badge';
import { EmptyState, ErrorState, LoadingState, InlineAlert } from '@/components/ui/states';
import { TBody, TD, TH, THead, TableContainer, TableEmpty } from '@/components/ui/table';
import { UserAvatar } from '@/components/ui/avatar';
import { FaceEnrollPanel } from '@/components/students/face-enroll-panel';
import { cn } from '@/lib/utils';

interface EditState {
  firstName: string;
  lastName: string;
  dob: string;
  sex: Sex;
  class: string;
  form: string;
  status: StudentStatus;
}

const EMPTY_EDIT: EditState = {
  firstName: '',
  lastName: '',
  dob: '',
  sex: 'FEMALE',
  class: '',
  form: '',
  status: 'ACTIVE',
};

export default function StudentDetailPage() {
  const params = useParams<{ studentId: string }>();
  const studentId = typeof params?.studentId === 'string' ? params.studentId : '';
  const router = useRouter();
  const toast = useToast();

  const [detail, setDetail] = useState<StudentDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const requestId = useRef(0);

  const [edit, setEdit] = useState<EditState>(EMPTY_EDIT);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [resetLoading, setResetLoading] = useState(false);
  const [resetResult, setResetResult] = useState<ResetPasswordResponse | null>(null);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const [statusConfirmOpen, setStatusConfirmOpen] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);

  const load = useCallback(async () => {
    if (!studentId) return;
    const id = requestId.current + 1;
    requestId.current = id;
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const result = await api.get<StudentDetailResponse>(`/students/${encodeURIComponent(studentId)}`);
      if (id !== requestId.current) return;
      setDetail(result);
    } catch (loadError) {
      if (id !== requestId.current) return;
      if (loadError instanceof Error && 'status' in loadError && (loadError as { status?: number }).status === 404) {
        setNotFound(true);
      } else {
        setError(apiErrorMessage(loadError));
      }
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [studentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const student = detail?.student;

  useEffect(() => {
    if (!student) return;
    setEdit({
      firstName: student.firstName,
      lastName: student.lastName,
      dob: student.dob,
      sex: student.sex,
      class: student.class,
      form: student.form,
      status: student.status ?? 'ACTIVE',
    });
  }, [student]);

  function updateEdit<K extends keyof EditState>(key: K, value: EditState[K]) {
    setEdit((current) => ({ ...current, [key]: value }));
    setEditErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!student) return;
    const errors: Record<string, string> = {};
    if (!edit.firstName.trim()) errors.firstName = 'First name is required.';
    if (!edit.lastName.trim()) errors.lastName = 'Last name is required.';
    if (!edit.dob) errors.dob = 'Date of birth is required.';
    else if (edit.dob >= todayISO()) errors.dob = 'Date of birth must be in the past.';
    if (!edit.class.trim()) errors.class = 'Class is required.';
    if (!edit.form.trim()) errors.form = 'Form is required.';
    setEditErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    setSaveError(null);
    try {
      await api.patch(`/students/${encodeURIComponent(student.studentId)}`, {
        firstName: edit.firstName.trim(),
        lastName: edit.lastName.trim(),
        dob: edit.dob,
        sex: edit.sex,
        class: edit.class.trim(),
        form: edit.form.trim(),
        status: edit.status,
      });
      toast.success('Details updated', 'The student record has been saved.');
      await load();
    } catch (saveFailure) {
      setSaveError(apiErrorMessage(saveFailure));
    } finally {
      setSaving(false);
    }
  }

  async function resetPassword() {
    if (!student) return;
    setResetLoading(true);
    try {
      const result = await api.post<ResetPasswordResponse>(`/students/${encodeURIComponent(student.studentId)}/reset-password`, {});
      setResetResult(result);
      setResetConfirmOpen(false);
      toast.success('Password reset', 'Share the temporary password with the student.');
    } catch (resetError) {
      toast.error('Could not reset password', apiErrorMessage(resetError));
    } finally {
      setResetLoading(false);
    }
  }

  async function toggleStatus() {
    if (!student) return;
    setStatusSaving(true);
    try {
      if (student.status === 'INACTIVE') {
        await api.patch(`/students/${encodeURIComponent(student.studentId)}`, { status: 'ACTIVE' });
        toast.success('Student reactivated', 'The student can check in again.');
      } else {
        await api.delete(`/students/${encodeURIComponent(student.studentId)}`);
        toast.success('Student deactivated', 'Attendance history is kept, but kiosk check-in is disabled.');
      }
      setStatusConfirmOpen(false);
      await load();
    } catch (statusError) {
      toast.error('Could not update status', apiErrorMessage(statusError));
    } finally {
      setStatusSaving(false);
    }
  }

  async function copyPassword() {
    if (!resetResult) return;
    try {
      await navigator.clipboard.writeText(resetResult.temporaryPassword);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy', 'Copy the password manually.');
    }
  }

  if (loading && !detail) {
    return (
      <div className="space-y-5">
        <Link href="/students" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800">
          <ArrowLeftIcon className="h-4 w-4" />
          Back to students
        </Link>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Student profile</h1>
        <Card>
          <LoadingState label="Loading student profile…" />
        </Card>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="space-y-5">
        <Link href="/students" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800">
          <ArrowLeftIcon className="h-4 w-4" />
          Back to students
        </Link>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Student profile</h1>
        <Card>
          <EmptyState
            icon={<UserIcon className="h-6 w-6" />}
            title={`Student ${studentId} was not found`}
            description="The student may have been removed or the ID is wrong."
            action={
              <Button variant="outline" onClick={() => router.push('/students')}>
                Back to student list
              </Button>
            }
          />
        </Card>
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="space-y-5">
        <Link href="/students" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800">
          <ArrowLeftIcon className="h-4 w-4" />
          Back to students
        </Link>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Student profile</h1>
        <Card>
          <ErrorState message={error ?? 'The student profile could not be loaded.'} onRetry={() => void load()} />
        </Card>
      </div>
    );
  }

  const attendance = detail?.recentAttendance ?? [];
  const isInactive = student.status === 'INACTIVE';

  return (
    <div className="space-y-5">
      <Link href="/students" className="focus-ring inline-flex items-center gap-1.5 rounded text-sm font-medium text-slate-500 transition hover:text-slate-800">
        <ArrowLeftIcon className="h-4 w-4" />
        Back to students
      </Link>

      <Card className="overflow-hidden">
        <div className="h-20 bg-gradient-to-r from-navy-950 via-navy-800 to-brand-700" aria-hidden="true" />
        <div className="px-5 pb-5 sm:px-6">
          <div className="-mt-10 flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-end gap-4">
              <div className="rounded-full bg-white p-1 shadow-card">
                <UserAvatar name={displayName(student)} photoUrl={student.photoUrl} size="xl" />
              </div>
              <div className="pb-1">
                <h1 className="text-xl font-bold tracking-tight text-slate-900">{displayName(student)}</h1>
                <p className="font-mono text-xs text-slate-500">{student.studentId}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 pb-1">
              <StudentStatusBadge status={student.status} />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setResetConfirmOpen(true)}
                leftIcon={<KeyIcon className="h-4 w-4" />}
              >
                Reset password
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStatusConfirmOpen(true)}
                leftIcon={isInactive ? <RefreshIcon className="h-4 w-4" /> : <TrashIcon className="h-4 w-4" />}
                className={isInactive ? undefined : 'text-rose-600 hover:bg-rose-50 hover:text-rose-700'}
              >
                {isInactive ? 'Reactivate student' : 'Deactivate student'}
              </Button>
            </div>
          </div>

          <dl className="mt-6 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Class</dt>
              <dd className="mt-0.5 font-semibold text-slate-900">{student.class}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Form</dt>
              <dd className="mt-0.5 font-semibold text-slate-900">{student.form}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Date of birth</dt>
              <dd className="mt-0.5 font-semibold text-slate-900">{formatDate(student.dob)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Sex</dt>
              <dd className="mt-0.5 font-semibold text-slate-900 capitalize">{student.sex.toLowerCase()}</dd>
            </div>
          </dl>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader
              title="Face enrolment"
              description="A face key is required for kiosk check-in."
              actions={<Link href="#face" className="text-xs font-semibold text-brand-700 hover:underline">Jump to panel</Link>}
            />
            <CardContent id="face">
              <FaceEnrollPanel
                enrollPath={`/students/${encodeURIComponent(student.studentId)}/face`}
                faceEnrolled={Boolean(student.faceEnrolled)}
                onEnrolled={() => void load()}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader
              title="Recent attendance"
              description="The latest records for this student"
              actions={
                <Link href={`/attendance?studentId=${encodeURIComponent(student.studentId)}`} className="text-xs font-semibold text-brand-700 hover:underline">
                  Open register
                </Link>
              }
            />
            <TableContainer className="rounded-none border-0 shadow-none">
              <THead>
                <tr>
                  <TH>Date</TH>
                  <TH>Status</TH>
                  <TH>Check in</TH>
                  <TH>Check out</TH>
                  <TH className="hidden sm:table-cell">Late</TH>
                </tr>
              </THead>
              {attendance.length === 0 ? (
                <TBody>
                  <TableEmpty
                    colSpan={5}
                    title="No attendance yet"
                    description="Attendance appears after the student's first kiosk check-in."
                    icon={<ClockIcon className="h-5 w-5" />}
                  />
                </TBody>
              ) : (
                <TBody>
                  {attendance.map((row: AttendanceRow, index) => (
                    <tr key={row.id ?? `${row.date}-${index}`} className="border-b border-slate-100 last:border-0">
                      <TD>
                        <p className="font-medium text-slate-800">{formatDate(row.date)}</p>
                        {row.note ? <p className="max-w-[220px] truncate text-xs text-slate-500">{row.note}</p> : null}
                      </TD>
                      <TD>
                        <AttendanceBadge status={row.status} />
                      </TD>
                      <TD className="tabular">{formatTime(row.checkInAt)}</TD>
                      <TD className="tabular">{formatTime(row.checkOutAt)}</TD>
                      <TD className="hidden sm:table-cell">
                        {row.lateMinutes > 0 ? (
                          <span className="font-medium text-amber-700">{row.lateMinutes} min</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </TD>
                    </tr>
                  ))}
                </TBody>
              )}
            </TableContainer>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Edit details" description="Changes are saved immediately." />
            <CardContent>
              <form onSubmit={saveEdit} className="space-y-4" noValidate>
                {saveError ? <InlineAlert variant="error">{saveError}</InlineAlert> : null}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                  <Field label="First name" htmlFor="edit-firstName" required error={editErrors.firstName}>
                    <Input
                      id="edit-firstName"
                      value={edit.firstName}
                      onChange={(event) => updateEdit('firstName', event.target.value)}
                      invalid={Boolean(editErrors.firstName)}
                    />
                  </Field>
                  <Field label="Last name" htmlFor="edit-lastName" required error={editErrors.lastName}>
                    <Input
                      id="edit-lastName"
                      value={edit.lastName}
                      onChange={(event) => updateEdit('lastName', event.target.value)}
                      invalid={Boolean(editErrors.lastName)}
                    />
                  </Field>
                  <Field label="Date of birth" htmlFor="edit-dob" required error={editErrors.dob}>
                    <Input
                      id="edit-dob"
                      type="date"
                      value={edit.dob}
                      max={todayISO()}
                      onChange={(event) => updateEdit('dob', event.target.value)}
                      invalid={Boolean(editErrors.dob)}
                    />
                  </Field>
                  <Field label="Sex" htmlFor="edit-sex">
                    <Select id="edit-sex" value={edit.sex} onChange={(event) => updateEdit('sex', event.target.value as Sex)}>
                      {SEX_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Class" htmlFor="edit-class" required error={editErrors.class}>
                    <Input
                      id="edit-class"
                      value={edit.class}
                      onChange={(event) => updateEdit('class', event.target.value)}
                      invalid={Boolean(editErrors.class)}
                    />
                  </Field>
                  <Field label="Form" htmlFor="edit-form" required error={editErrors.form}>
                    <Input
                      id="edit-form"
                      value={edit.form}
                      onChange={(event) => updateEdit('form', event.target.value)}
                      invalid={Boolean(editErrors.form)}
                    />
                  </Field>
                  <Field label="Status" htmlFor="edit-status">
                    <Select
                      id="edit-status"
                      value={edit.status}
                      onChange={(event) => updateEdit('status', event.target.value as StudentStatus)}
                    >
                      <option value="ACTIVE">Active</option>
                      <option value="INACTIVE">Inactive</option>
                    </Select>
                  </Field>
                </div>
                <Button type="submit" loading={saving} leftIcon={<PencilIcon className="h-4 w-4" />}>
                  Save changes
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Account" description="Login and access management" />
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                  <UserIcon className="h-4 w-4" />
                </span>
                <div className="min-w-0 text-sm">
                  <p className="font-medium text-slate-800">Student portal access</p>
                  <p className="text-xs text-slate-500">
                    Sign in at <span className="font-mono">/student</span> with the student ID and password.
                  </p>
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-500">Face recognition</p>
                <p className={cn('mt-0.5 text-sm font-semibold', student.faceEnrolled ? 'text-brand-700' : 'text-amber-700')}>
                  {student.faceEnrolled ? 'Ready for kiosk check-in' : 'Enrol a face to enable check-in'}
                </p>
              </div>
              <Button variant="outline" fullWidth onClick={() => setResetConfirmOpen(true)} leftIcon={<KeyIcon className="h-4 w-4" />}>
                Reset student password
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={resetConfirmOpen}
        onClose={() => setResetConfirmOpen(false)}
        onConfirm={() => void resetPassword()}
        title="Reset student password?"
        message={
          <>
            A new temporary password will be generated for <strong>{displayName(student)}</strong>. The current password stops working
            immediately.
          </>
        }
        confirmLabel="Reset password"
        tone="primary"
        loading={resetLoading}
      />

      <ConfirmDialog
        open={statusConfirmOpen}
        onClose={() => setStatusConfirmOpen(false)}
        onConfirm={() => void toggleStatus()}
        title={isInactive ? 'Reactivate this student?' : 'Deactivate this student?'}
        message={
          isInactive ? (
            <>
              <strong>{displayName(student)}</strong> will be able to check in at kiosks and sign in to the student portal again.
            </>
          ) : (
            <>
              <strong>{displayName(student)}</strong> keeps their attendance history but can no longer check in at a kiosk or sign in.
              You can reactivate the student later.
            </>
          )
        }
        confirmLabel={isInactive ? 'Reactivate' : 'Deactivate'}
        tone={isInactive ? 'primary' : 'danger'}
        loading={statusSaving}
      />

      <Modal
        open={Boolean(resetResult)}
        onClose={() => setResetResult(null)}
        title="Temporary password"
        description="This password is shown only once."
        size="sm"
        footer={<Button onClick={() => setResetResult(null)}>Done</Button>}
      >
        {resetResult ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-800">
              <CheckCircleIcon className="h-4 w-4 shrink-0" />
              Password reset for {resetResult.studentId}
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Temporary password</p>
              <p className="mt-1 break-all font-mono text-lg font-bold text-slate-900">{resetResult.temporaryPassword}</p>
            </div>
            <Button variant="outline" fullWidth onClick={() => void copyPassword()} leftIcon={<CopyIcon className="h-4 w-4" />}>
              {copied ? 'Copied to clipboard' : 'Copy password'}
            </Button>
            <p className="text-xs text-slate-500">
              Share it with the student securely. They should change it after signing in at <span className="font-mono">/student</span>.
            </p>
          </div>
        ) : null}
      </Modal>

      <p className="px-1 text-xs text-slate-400">
        {student.createdAt ? `Record created ${formatDateTime(student.createdAt)}. ` : ''}
        Showing the {attendance.length} most recent attendance records and the current face-enrolment status.
      </p>
    </div>
  );
}
