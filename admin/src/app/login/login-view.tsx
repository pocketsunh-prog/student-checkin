'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { api, apiErrorMessage } from '@/lib/api';
import { getAdminSession, setAdminSession } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import type { AdminLoginResponse } from '@/lib/types';
import {
  AlertIcon,
  CheckIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  GraduationCapIcon,
  LockIcon,
  MailIcon,
  ShieldIcon,
  SparkIcon,
  UsersIcon,
} from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { InlineAlert } from '@/components/ui/states';

const DEMO_EMAIL = 'admin@school.edu';
const DEMO_PASSWORD = 'Admin@12345';

export function LoginView() {
  const router = useRouter();
  const toast = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [expired, setExpired] = useState(false);
  const [safeNext, setSafeNext] = useState('/');

  // Read the query string after mount (keeps this page statically renderable).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setExpired(params.get('expired') === '1');
    const nextPath = params.get('next');
    setSafeNext(nextPath && nextPath.startsWith('/') && !nextPath.startsWith('//') ? nextPath : '/');
  }, []);

  useEffect(() => {
    if (getAdminSession()) router.replace(safeNext);
  }, [router, safeNext]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await api.post<AdminLoginResponse>(
        '/auth/admin/login',
        { email: email.trim(), password },
        { auth: 'none', redirectOnUnauthorized: false },
      );
      setAdminSession(data.token, data.user);
      toast.success(`Welcome back, ${data.user.name || 'Administrator'}`, 'You are signed in to the admin console.');
      router.replace(safeNext);
    } catch (loginError) {
      setError(apiErrorMessage(loginError));
    } finally {
      setLoading(false);
    }
  }

  function useDemoCredentials() {
    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
    setError(null);
  }

  async function copyDemoCredentials() {
    try {
      await navigator.clipboard.writeText(`${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Your browser blocked clipboard access. Type the demo credentials instead.');
    }
  }

  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-navy-950 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              'radial-gradient(ellipse at 20% 0%, rgba(16,185,129,0.28), transparent 55%), radial-gradient(ellipse at 90% 90%, rgba(59,130,246,0.18), transparent 55%)',
          }}
          aria-hidden="true"
        />
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)',
            backgroundSize: '44px 44px',
          }}
          aria-hidden="true"
        />

        <div className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500 text-white shadow-lg shadow-brand-500/30">
            <GraduationCapIcon className="h-6 w-6" />
          </span>
          <div>
            <p className="text-lg font-bold leading-tight text-white">SchoolCheck</p>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Student attendance</p>
          </div>
        </div>

        <div className="relative max-w-lg">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-brand-200">
            <SparkIcon className="h-3.5 w-3.5" />
            Face recognition kiosk · v1
          </p>
          <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight text-white">
            Attendance that takes
            <span className="text-brand-400"> one second.</span>
          </h1>
          <p className="mt-4 text-base leading-relaxed text-slate-300">
            Students walk in, the kiosk recognises their face, and the register updates itself. Admins get live
            numbers, late alerts and exportable reports — without a single roll call.
          </p>

          <ul className="mt-8 space-y-3">
            {[
              'Face check-in / check-out at the school gate',
              'Live dashboard with late and absence tracking',
              'Student records, face enrolment and CSV reports',
            ].map((feature) => (
              <li key={feature} className="flex items-start gap-3 text-sm text-slate-200">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-brand-300">
                  <CheckIcon className="h-3.5 w-3.5" />
                </span>
                {feature}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <ShieldIcon className="h-4 w-4" />
            Role-based access · 12h sessions
          </span>
          <span className="inline-flex items-center gap-1.5">
            <UsersIcon className="h-4 w-4" />
            Greenfield Secondary School
          </span>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-col justify-center px-4 py-10 sm:px-8 lg:px-12">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-navy-950 text-brand-400">
              <GraduationCapIcon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-base font-bold leading-tight text-slate-900">SchoolCheck</p>
              <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Admin console</p>
            </div>
          </div>

          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Sign in</h2>
          <p className="mt-1.5 text-sm text-slate-500">Use your school administrator account to continue.</p>

          {expired ? (
            <InlineAlert variant="info" className="mt-5">
              Your session has expired. Please sign in again.
            </InlineAlert>
          ) : null}

          {error ? (
            <div className="mt-5 flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">
              <AlertIcon className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
              <span>{error}</span>
            </div>
          ) : null}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
            <Field label="Email address" htmlFor="email" required>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                placeholder="admin@school.edu"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                icon={<MailIcon className="h-4 w-4" />}
                required
                disabled={loading}
              />
            </Field>

            <Field label="Password" htmlFor="password" required>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400" aria-hidden="true">
                  <LockIcon className="h-4 w-4" />
                </span>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••••"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  disabled={loading}
                  className="field-input pl-10 pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="focus-ring absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-lg text-slate-400 transition hover:text-slate-600"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                >
                  {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                </button>
              </div>
            </Field>

            <Button type="submit" size="lg" fullWidth loading={loading} className="!mt-6">
              {loading ? 'Signing in…' : 'Sign in to console'}
            </Button>
          </form>

          <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50/80 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Demo credentials</p>
              <button
                type="button"
                onClick={() => void copyDemoCredentials()}
                className="focus-ring inline-flex items-center gap-1 rounded text-xs font-medium text-slate-500 transition hover:text-slate-800"
              >
                {copied ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="mt-2 space-y-1 font-mono text-xs text-slate-700">
              <p>
                <span className="text-slate-400">email </span>
                {DEMO_EMAIL}
              </p>
              <p>
                <span className="text-slate-400">pass&nbsp; </span>
                {DEMO_PASSWORD}
              </p>
            </div>
            <Button variant="outline" size="sm" fullWidth className="mt-3" onClick={useDemoCredentials} disabled={loading}>
              Fill demo credentials
            </Button>
          </div>

          <div className="mt-8 space-y-2 border-t border-slate-200 pt-5 text-sm text-slate-500">
            <p>
              Student?{' '}
              <Link href="/student" className="focus-ring rounded font-semibold text-brand-700 underline-offset-2 hover:underline">
                Open the student portal
              </Link>
            </p>
            <p>
              New student?{' '}
              <Link href="/register" className="focus-ring rounded font-semibold text-brand-700 underline-offset-2 hover:underline">
                Register with your face photo
              </Link>
            </p>
          </div>

          <p className="mt-8 text-center text-[11px] text-slate-400">
            Demo students: STU001–STU012 · password Student@12345
          </p>
        </div>
      </div>
    </div>
  );
}
