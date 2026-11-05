'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api, apiErrorMessage, ApiError } from '@/lib/api';
import { setStudentSession } from '@/lib/auth';
import type { Sex, StudentAuthResponse } from '@/lib/types';
import { SEX_OPTIONS, todayISO } from '@/lib/utils';
import { useToast } from '@/lib/toast';
import {
  AlertIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CameraIcon,
  CheckCircleIcon,
  CheckIcon,
  GraduationCapIcon,
  LockIcon,
  ShieldIcon,
  UserIcon,
} from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Checkbox } from '@/components/ui/input';
import { InlineAlert } from '@/components/ui/states';
import { WebcamCapture, type CapturedPhoto } from '@/components/webcam-capture';

interface FormState {
  studentId: string;
  firstName: string;
  lastName: string;
  dob: string;
  sex: Sex;
  class: string;
  form: string;
  password: string;
  confirmPassword: string;
}

const EMPTY: FormState = {
  studentId: '',
  firstName: '',
  lastName: '',
  dob: '',
  sex: 'FEMALE',
  class: '',
  form: '',
  password: '',
  confirmPassword: '',
};

type Step = 'details' | 'face' | 'success';

export default function RegisterPage() {
  const router = useRouter();
  const toast = useToast();

  const [step, setStep] = useState<Step>('details');
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [registered, setRegistered] = useState<StudentAuthResponse | null>(null);
  const [copied, setCopied] = useState(false);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    if (key === 'studentId') setSubmitError(null);
  }

  function validateDetails(): boolean {
    const next: Record<string, string> = {};
    if (!/^[A-Za-z0-9_-]{3,20}$/.test(form.studentId.trim())) {
      next.studentId = 'Use 3–20 letters, numbers, hyphens or underscores.';
    }
    if (!form.firstName.trim()) next.firstName = 'First name is required.';
    else if (form.firstName.trim().length > 60) next.firstName = 'First name is too long (max 60).';
    if (!form.lastName.trim()) next.lastName = 'Last name is required.';
    else if (form.lastName.trim().length > 60) next.lastName = 'Last name is too long (max 60).';
    if (!form.dob) next.dob = 'Date of birth is required.';
    else if (form.dob >= todayISO()) next.dob = 'Date of birth must be in the past.';
    if (!form.class.trim()) next.class = 'Class is required, e.g. 7A.';
    if (!form.form.trim()) next.form = 'Form is required, e.g. Form 2.';
    if (form.password.length < 8) next.password = 'Password must be at least 8 characters.';
    if (form.confirmPassword !== form.password) next.confirmPassword = 'Passwords do not match.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function goToFace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    if (!validateDetails()) return;
    setStep('face');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function submitRegistration() {
    setSubmitError(null);
    if (!photo) {
      setSubmitError('Take a face photo before finishing registration.');
      return;
    }
    if (!consent) {
      setConsentError(true);
      return;
    }
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
      body.append('password', form.password);
      body.append('faceImage', photo.blob, photo.fileName);

      const result = await api.upload<StudentAuthResponse>('/auth/student/register', body, { auth: 'none' });
      setStudentSession(result.token, result.student);
      setRegistered(result);
      setStep('success');
      toast.success('Registration complete', `Welcome, ${result.student.fullName}!`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (registerError) {
      if (registerError instanceof ApiError && registerError.code === 'CONFLICT') {
        setSubmitError(registerError.message || 'That student ID is already taken. Choose another one.');
      } else if (registerError instanceof ApiError && registerError.code === 'FACE_ALREADY_ENROLLED') {
        setSubmitError('This face is already registered to another student. Ask a teacher for help.');
      } else if (registerError instanceof ApiError && registerError.code === 'VALIDATION_ERROR') {
        setSubmitError(apiErrorMessage(registerError));
      } else {
        setSubmitError(apiErrorMessage(registerError));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function copyStudentId() {
    if (!registered) return;
    try {
      await navigator.clipboard.writeText(registered.student.studentId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be blocked; the ID is visible on screen.
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/login" className="focus-ring flex items-center gap-2.5 rounded-lg">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-navy-950 text-brand-400">
              <GraduationCapIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-bold leading-tight text-slate-900">SchoolCheck</p>
              <p className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Student registration</p>
            </div>
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <Link href="/student" className="focus-ring rounded px-2 py-1 font-medium text-slate-600 hover:text-slate-900">
              Student sign in
            </Link>
            <Link
              href="/login"
              className="focus-ring hidden rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 sm:block"
            >
              Admin
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:py-12">
        {step === 'success' && registered ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-card sm:p-10">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <CheckCircleIcon className="h-9 w-9" />
            </div>
            <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">You&apos;re registered!</h1>
            <p className="mt-1.5 text-sm text-slate-500">
              Welcome to SchoolCheck, {registered.student.fullName}. Your face is enrolled and you can check in at the school gate kiosk.
            </p>

            <div className="mx-auto mt-6 max-w-sm rounded-xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Your student ID</p>
              <p className="mt-1 font-mono text-2xl font-bold text-slate-900">{registered.student.studentId}</p>
              <div className="mt-4 flex items-center justify-center gap-3 text-xs text-slate-600">
                <span>
                  {registered.student.class} · {registered.student.form}
                </span>
                <span className="h-3 w-px bg-slate-300" aria-hidden="true" />
                <span className="inline-flex items-center gap-1 text-brand-700">
                  <CheckIcon className="h-3.5 w-3.5" />
                  Face enrolled
                </span>
              </div>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => void copyStudentId()}>
                {copied ? 'Student ID copied' : 'Copy student ID'}
              </Button>
            </div>

            <p className="mx-auto mt-5 max-w-md text-xs text-slate-500">
              Remember your student ID and password — you need them to sign in to the student portal. You can change your password there at any
              time.
            </p>

            <div className="mt-7 flex flex-col justify-center gap-2 sm:flex-row">
              <Button onClick={() => router.push('/student')} rightIcon={<ArrowRightIcon className="h-4 w-4" />}>
                Open student portal
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setForm(EMPTY);
                  setPhoto(null);
                  setConsent(false);
                  setRegistered(null);
                  setStep('details');
                }}
              >
                Register another student
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="text-center">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Register as a student</h1>
              <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">
                Create your school attendance account and add a face photo. The photo is used only to recognise you when you check in or out at
                school.
              </p>
            </div>

            <ol className="mx-auto mt-6 flex max-w-md items-center gap-2" aria-label="Registration progress">
              <li className="flex flex-1 items-center gap-2">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    step === 'details' ? 'bg-brand-600 text-white' : 'bg-brand-100 text-brand-700'
                  }`}
                >
                  1
                </span>
                <span className={`text-xs font-semibold ${step === 'details' ? 'text-slate-900' : 'text-slate-500'}`}>Your details</span>
              </li>
              <li className="h-px flex-1 bg-slate-200" aria-hidden="true" />
              <li className="flex flex-1 items-center justify-end gap-2">
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    step === 'face' ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  2
                </span>
                <span className={`text-xs font-semibold ${step === 'face' ? 'text-slate-900' : 'text-slate-500'}`}>Face photo</span>
              </li>
            </ol>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-7">
              {step === 'details' ? (
                <form onSubmit={goToFace} className="space-y-5" noValidate>
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <UserIcon className="h-4 w-4 text-slate-400" />
                    Student information
                  </div>

                  {submitError ? <InlineAlert variant="error">{submitError}</InlineAlert> : null}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Student ID" htmlFor="reg-studentId" required error={errors.studentId} hint="Unique — ask your school if unsure.">
                      <Input
                        id="reg-studentId"
                        value={form.studentId}
                        onChange={(event) => update('studentId', event.target.value)}
                        invalid={Boolean(errors.studentId)}
                        placeholder="STU1001"
                        autoComplete="username"
                        required
                      />
                    </Field>
                    <Field label="Date of birth" htmlFor="reg-dob" required error={errors.dob}>
                      <Input
                        id="reg-dob"
                        type="date"
                        value={form.dob}
                        max={todayISO()}
                        onChange={(event) => update('dob', event.target.value)}
                        invalid={Boolean(errors.dob)}
                        required
                      />
                    </Field>
                    <Field label="First name" htmlFor="reg-firstName" required error={errors.firstName}>
                      <Input
                        id="reg-firstName"
                        value={form.firstName}
                        onChange={(event) => update('firstName', event.target.value)}
                        invalid={Boolean(errors.firstName)}
                        autoComplete="given-name"
                        required
                      />
                    </Field>
                    <Field label="Last name" htmlFor="reg-lastName" required error={errors.lastName}>
                      <Input
                        id="reg-lastName"
                        value={form.lastName}
                        onChange={(event) => update('lastName', event.target.value)}
                        invalid={Boolean(errors.lastName)}
                        autoComplete="family-name"
                        required
                      />
                    </Field>
                    <Field label="Sex" htmlFor="reg-sex" required>
                      <Select id="reg-sex" value={form.sex} onChange={(event) => update('sex', event.target.value as Sex)}>
                        {SEX_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Class" htmlFor="reg-class" required error={errors.class}>
                        <Input
                          id="reg-class"
                          value={form.class}
                          onChange={(event) => update('class', event.target.value)}
                          invalid={Boolean(errors.class)}
                          placeholder="7A"
                          required
                        />
                      </Field>
                      <Field label="Form" htmlFor="reg-form" required error={errors.form}>
                        <Input
                          id="reg-form"
                          value={form.form}
                          onChange={(event) => update('form', event.target.value)}
                          invalid={Boolean(errors.form)}
                          placeholder="Form 2"
                          required
                        />
                      </Field>
                    </div>
                    <Field label="Password" htmlFor="reg-password" required error={errors.password} hint="At least 8 characters.">
                      <div className="relative">
                        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
                          <LockIcon className="h-4 w-4" />
                        </span>
                        <Input
                          id="reg-password"
                          type="password"
                          value={form.password}
                          onChange={(event) => update('password', event.target.value)}
                          invalid={Boolean(errors.password)}
                          className="pl-10"
                          autoComplete="new-password"
                          required
                        />
                      </div>
                    </Field>
                    <Field label="Confirm password" htmlFor="reg-confirmPassword" required error={errors.confirmPassword}>
                      <div className="relative">
                        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
                          <LockIcon className="h-4 w-4" />
                        </span>
                        <Input
                          id="reg-confirmPassword"
                          type="password"
                          value={form.confirmPassword}
                          onChange={(event) => update('confirmPassword', event.target.value)}
                          invalid={Boolean(errors.confirmPassword)}
                          className="pl-10"
                          autoComplete="new-password"
                          required
                        />
                      </div>
                    </Field>
                  </div>

                  <div className="flex flex-col-reverse items-center justify-between gap-3 border-t border-slate-100 pt-4 sm:flex-row">
                    <Link href="/login" className="focus-ring inline-flex items-center gap-1.5 rounded text-sm font-medium text-slate-500 hover:text-slate-800">
                      <ArrowLeftIcon className="h-4 w-4" />
                      Back to sign in
                    </Link>
                    <Button type="submit" rightIcon={<ArrowRightIcon className="h-4 w-4" />}>
                      Continue to face photo
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="space-y-5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <CameraIcon className="h-4 w-4 text-slate-400" />
                    Face photo
                  </div>

                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Registering as</p>
                    <p className="mt-0.5 text-sm font-semibold text-slate-900">
                      {form.firstName} {form.lastName} · <span className="font-mono">{form.studentId}</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      {form.class} · {form.form}
                    </p>
                    <button
                      type="button"
                      onClick={() => setStep('details')}
                      className="focus-ring mt-1 rounded text-xs font-semibold text-brand-700 underline-offset-2 hover:underline"
                    >
                      Edit details
                    </button>
                  </div>

                  <div>
                    <p className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
                      <ShieldIcon className="h-4 w-4 text-slate-400" />
                      Look at the camera, then capture
                    </p>
                    <WebcamCapture
                      onCapture={(captured) => {
                        setPhoto(captured);
                        if (captured) setSubmitError(null);
                      }}
                      disabled={submitting}
                      hint="Keep your whole face inside the oval. No hats or sunglasses."
                    />
                  </div>

                  <Checkbox
                    id="reg-consent"
                    checked={consent}
                    onChange={(event) => {
                      setConsent(event.target.checked);
                      if (event.target.checked) setConsentError(false);
                    }}
                    label="I agree to my face photo being used for school attendance"
                    description="The photo and face data are stored by the school and used only to mark my check-in and check-out. I can ask the school office to re-enrol or remove it."
                  />
                  {consentError ? (
                    <p className="flex items-center gap-1.5 text-xs font-medium text-rose-600" role="alert">
                      <AlertIcon className="h-3.5 w-3.5" />
                      Please agree to the face photo consent before registering.
                    </p>
                  ) : null}

                  {submitError ? <InlineAlert variant="error">{submitError}</InlineAlert> : null}

                  <div className="flex flex-col-reverse items-center justify-between gap-3 border-t border-slate-100 pt-4 sm:flex-row">
                    <Button variant="ghost" onClick={() => setStep('details')} disabled={submitting} leftIcon={<ArrowLeftIcon className="h-4 w-4" />}>
                      Back
                    </Button>
                    <Button
                      onClick={() => void submitRegistration()}
                      loading={submitting}
                      disabled={!photo}
                      leftIcon={photo ? <CheckIcon className="h-4 w-4" /> : <CameraIcon className="h-4 w-4" />}
                    >
                      {submitting ? 'Registering…' : 'Complete registration'}
                    </Button>
                  </div>

                  {!photo ? <p className="text-center text-xs text-slate-400">Capture a face photo to enable the finish button.</p> : null}
                </div>
              )}
            </div>
          </>
        )}

        <p className="mt-6 text-center text-xs text-slate-400">
          Already registered?{' '}
          <Link href="/student" className="font-semibold text-slate-600 underline-offset-2 hover:underline">
            Sign in to the student portal
          </Link>
        </p>
      </main>
    </div>
  );
}
