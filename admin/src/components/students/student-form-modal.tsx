'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { api, apiErrorMessage } from '@/lib/api';
import type { CreateStudentResponse, Sex } from '@/lib/types';
import { SEX_OPTIONS, todayISO } from '@/lib/utils';
import { useToast } from '@/lib/toast';
import { CheckCircleIcon, CopyIcon, UserIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { InlineAlert } from '@/components/ui/states';
import { WebcamCapture, type CapturedPhoto } from '@/components/webcam-capture';

interface StudentFormState {
  studentId: string;
  firstName: string;
  lastName: string;
  dob: string;
  sex: Sex;
  class: string;
  form: string;
  password: string;
}

const EMPTY_FORM: StudentFormState = {
  studentId: '',
  firstName: '',
  lastName: '',
  dob: '',
  sex: 'FEMALE',
  class: '',
  form: '',
  password: '',
};

export interface StudentFormModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (created: CreateStudentResponse) => void;
}

export function StudentFormModal({ open, onClose, onCreated }: StudentFormModalProps) {
  const toast = useToast();
  const [form, setForm] = useState<StudentFormState>(EMPTY_FORM);
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreateStudentResponse | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(EMPTY_FORM);
    setPhoto(null);
    setShowCamera(false);
    setErrors({});
    setFormError(null);
    setCreated(null);
    setCopied(false);
  }, [open]);

  function update<K extends keyof StudentFormState>(key: K, value: StudentFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!/^[A-Za-z0-9_-]{3,20}$/.test(form.studentId.trim())) {
      next.studentId = 'Use 3–20 letters, numbers, hyphens or underscores.';
    }
    if (!form.firstName.trim()) next.firstName = 'First name is required.';
    if (!form.lastName.trim()) next.lastName = 'Last name is required.';
    if (!form.dob) next.dob = 'Date of birth is required.';
    else if (form.dob >= todayISO()) next.dob = 'Date of birth must be in the past.';
    if (!form.class.trim()) next.class = 'Class is required, e.g. 7A.';
    if (!form.form.trim()) next.form = 'Form is required, e.g. Form 2.';
    if (form.password && form.password.length < 8) next.password = 'Password must be at least 8 characters.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      const body = new FormData();
      body.append('studentId', form.studentId.trim());
      body.append('firstName', form.firstName.trim());
      body.append('lastName', form.lastName.trim());
      body.append('dob', form.dob);
      body.append('sex', form.sex);
      body.append('class', form.class.trim());
      body.append('form', form.form.trim());
      if (form.password) body.append('password', form.password);
      if (photo) body.append('faceImage', photo.blob, photo.fileName);

      const result = await api.upload<CreateStudentResponse>('/students', body);
      setCreated(result);
      onCreated(result);
      toast.success('Student created', `${result.student.fullName} (${result.student.studentId}) has been added.`);
    } catch (submitError) {
      setFormError(apiErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  async function copyPassword() {
    if (!created) return;
    const password = created.initialPassword ?? 'Student@12345';
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy', 'Copy the password manually.');
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={created ? 'Student created' : 'Add a student'}
      description={created ? undefined : 'Create a student record. Face enrolment is optional now and can be done later.'}
      size="lg"
      busy={submitting}
      footer={
        created ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="outline" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" form="create-student-form" loading={submitting} leftIcon={<UserIcon className="h-4 w-4" />}>
              Create student
            </Button>
          </>
        )
      }
    >
      {created ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
            <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
            <div>
              <p className="font-semibold">
                {created.student.fullName} · {created.student.studentId}
              </p>
              <p className="mt-0.5 text-brand-700">
                Class {created.student.class} · {created.student.form} ·{' '}
                {created.student.faceEnrolled ? 'face enrolled' : 'no face enrolled yet'}
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Initial password</p>
            <p className="mt-1 font-mono text-sm font-semibold text-slate-900">
              {created.initialPassword ?? 'Student@12345 (default)'}
            </p>
            <p className="mt-1 text-xs text-slate-500">Share this with the student once. They can change it in the student portal.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => void copyPassword()} leftIcon={<CopyIcon className="h-3.5 w-3.5" />}>
              {copied ? 'Copied' : 'Copy password'}
            </Button>
          </div>

          {!created.student.faceEnrolled ? (
            <p className="text-xs text-slate-500">
              Tip: open the student&apos;s profile to enrol a face photo — students cannot check in at the kiosk until a face is enrolled.
            </p>
          ) : null}
        </div>
      ) : (
        <form id="create-student-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
          {formError ? <InlineAlert variant="error">{formError}</InlineAlert> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Student ID" htmlFor="studentId" required error={errors.studentId} hint="Unique, e.g. STU1001">
              <Input
                id="studentId"
                name="studentId"
                value={form.studentId}
                onChange={(event) => update('studentId', event.target.value)}
                invalid={Boolean(errors.studentId)}
                placeholder="STU1001"
                autoComplete="off"
                required
              />
            </Field>
            <Field label="Sex" htmlFor="sex" required>
              <Select id="sex" name="sex" value={form.sex} onChange={(event) => update('sex', event.target.value as Sex)}>
                {SEX_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="First name" htmlFor="firstName" required error={errors.firstName}>
              <Input
                id="firstName"
                name="firstName"
                value={form.firstName}
                onChange={(event) => update('firstName', event.target.value)}
                invalid={Boolean(errors.firstName)}
                autoComplete="off"
                required
              />
            </Field>
            <Field label="Last name" htmlFor="lastName" required error={errors.lastName}>
              <Input
                id="lastName"
                name="lastName"
                value={form.lastName}
                onChange={(event) => update('lastName', event.target.value)}
                invalid={Boolean(errors.lastName)}
                autoComplete="off"
                required
              />
            </Field>
            <Field label="Date of birth" htmlFor="dob" required error={errors.dob}>
              <Input
                id="dob"
                name="dob"
                type="date"
                value={form.dob}
                max={todayISO()}
                onChange={(event) => update('dob', event.target.value)}
                invalid={Boolean(errors.dob)}
                required
              />
            </Field>
            <Field label="Password" htmlFor="password" hint="Optional — defaults to Student@12345" error={errors.password}>
              <Input
                id="password"
                name="password"
                type="text"
                value={form.password}
                onChange={(event) => update('password', event.target.value)}
                invalid={Boolean(errors.password)}
                placeholder="Leave blank for default"
                autoComplete="new-password"
              />
            </Field>
            <Field label="Class" htmlFor="class" required error={errors.class}>
              <Input
                id="class"
                name="class"
                value={form.class}
                onChange={(event) => update('class', event.target.value)}
                invalid={Boolean(errors.class)}
                placeholder="7A"
                autoComplete="off"
                required
              />
            </Field>
            <Field label="Form" htmlFor="form" required error={errors.form}>
              <Input
                id="form"
                name="form"
                value={form.form}
                onChange={(event) => update('form', event.target.value)}
                invalid={Boolean(errors.form)}
                placeholder="Form 2"
                autoComplete="off"
                required
              />
            </Field>
          </div>

          <fieldset className="rounded-lg border border-slate-200 p-4">
            <legend className="px-1 text-sm font-semibold text-slate-700">Face photo (optional)</legend>
            {photo ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.dataUrl} alt="Face photo preview" className="h-14 w-14 rounded-full object-cover ring-2 ring-brand-200" />
                  <div>
                    <p className="text-sm font-medium text-slate-800">Face photo ready</p>
                    <p className="text-xs text-slate-500">It will be uploaded with the new student.</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setPhoto(null)}>
                  Remove
                </Button>
              </div>
            ) : showCamera ? (
              <WebcamCapture
                onCapture={(captured) => {
                  setPhoto(captured);
                  if (captured) setShowCamera(false);
                }}
                hint="Look straight at the camera — the photo becomes the student's face key."
              />
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-500">
                  Add a clear, front-facing photo now, or enrol later from the student profile.
                </p>
                <Button variant="outline" size="sm" onClick={() => setShowCamera(true)}>
                  Enrol face now
                </Button>
              </div>
            )}
            {showCamera ? (
              <div className="mt-2 flex justify-end">
                <Button variant="ghost" size="sm" onClick={() => setShowCamera(false)}>
                  Skip for now
                </Button>
              </div>
            ) : null}
          </fieldset>
        </form>
      )}
    </Modal>
  );
}
