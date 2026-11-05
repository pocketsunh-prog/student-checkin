'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, apiErrorMessage } from '@/lib/api';
import type { Settings } from '@/lib/types';
import { TIMEZONES, WEEKDAYS, clamp } from '@/lib/utils';
import { useToast } from '@/lib/toast';
import { AlertIcon, ClockIcon, GlobeIcon, GraduationCapIcon, PencilIcon, ShieldIcon, SparkIcon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { ErrorState, InlineAlert } from '@/components/ui/states';
import { Skeleton } from '@/components/ui/skeleton';

interface FormState {
  schoolName: string;
  dayStartTime: string;
  lateGraceMinutes: string;
  timezone: string;
  faceMatchThreshold: string;
  schoolDays: number[];
}

const EMPTY: FormState = {
  schoolName: '',
  dayStartTime: '08:00',
  lateGraceMinutes: '5',
  timezone: 'Asia/Hong_Kong',
  faceMatchThreshold: '0.60',
  schoolDays: [1, 2, 3, 4, 5],
};

function toForm(settings: Settings): FormState {
  return {
    schoolName: settings.schoolName ?? '',
    dayStartTime: settings.dayStartTime ?? '08:00',
    lateGraceMinutes: String(settings.lateGraceMinutes ?? 5),
    timezone: settings.timezone ?? 'Asia/Hong_Kong',
    faceMatchThreshold: String(settings.faceMatchThreshold ?? 0.6),
    schoolDays: Array.isArray(settings.schoolDays) ? settings.schoolDays : [1, 2, 3, 4, 5],
  };
}

export default function SettingsPage() {
  const toast = useToast();

  const [settings, setSettings] = useState<Settings | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<Settings>('/settings');
      setSettings(result);
      setForm(toForm(result));
    } catch (loadError) {
      setError(apiErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key as string]) return current;
      const next = { ...current };
      delete next[key as string];
      return next;
    });
  }

  function toggleSchoolDay(day: number) {
    setForm((current) => ({
      ...current,
      schoolDays: current.schoolDays.includes(day)
        ? current.schoolDays.filter((value) => value !== day)
        : [...current.schoolDays, day].sort((a, b) => a - b),
    }));
    setErrors((current) => {
      if (!current.schoolDays) return current;
      const next = { ...current };
      delete next.schoolDays;
      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError(null);

    const nextErrors: Record<string, string> = {};
    const grace = Number(form.lateGraceMinutes);
    const threshold = Number(form.faceMatchThreshold);

    if (!form.schoolName.trim()) nextErrors.schoolName = 'School name is required.';
    if (!form.dayStartTime) nextErrors.dayStartTime = 'School start time is required.';
    if (!Number.isFinite(grace) || grace < 0 || grace > 120) nextErrors.lateGraceMinutes = 'Enter a whole number from 0 to 120.';
    if (!Number.isFinite(threshold) || threshold < 0.3 || threshold > 0.95) {
      nextErrors.faceMatchThreshold = 'Use a value between 0.30 and 0.95.';
    }
    if (form.schoolDays.length === 0) nextErrors.schoolDays = 'Select at least one school day.';
    if (!form.timezone) nextErrors.timezone = 'Choose a timezone.';

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      const payload: Settings = {
        schoolName: form.schoolName.trim(),
        dayStartTime: form.dayStartTime,
        lateGraceMinutes: Math.round(clamp(grace, 0, 120)),
        timezone: form.timezone,
        faceMatchThreshold: Number(clamp(threshold, 0.3, 0.95).toFixed(2)),
        schoolDays: form.schoolDays,
      };
      const result = await api.put<Settings>('/settings', payload);
      setSettings(result ?? payload);
      setForm(toForm(result ?? payload));
      toast.success('Settings saved', 'New scans and reports will use these rules.');
    } catch (saveFailure) {
      setSaveError(apiErrorMessage(saveFailure));
    } finally {
      setSaving(false);
    }
  }

  const timezoneOptions = form.timezone && !TIMEZONES.includes(form.timezone) ? [form.timezone, ...TIMEZONES] : TIMEZONES;
  const thresholdNumber = Number(form.faceMatchThreshold);
  const thresholdHint = !Number.isFinite(thresholdNumber)
    ? 'Enter a number between 0.30 and 0.95.'
    : thresholdNumber >= 0.75
      ? 'Strict — fewer false matches, but some genuine students may be rejected.'
      : thresholdNumber <= 0.5
        ? 'Lenient — accepts more, but may match the wrong student.'
        : 'Balanced default. Tune on the school’s own cameras.';

  if (loading && !settings) {
    return (
      <div className="space-y-5">
        <PageHeader title="Settings" description="School-wide rules for attendance, late calculation and face matching." />
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="p-5">
            <Skeleton className="h-5 w-40" />
            <div className="mt-5 space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </Card>
          <Card className="p-5">
            <Skeleton className="h-5 w-40" />
            <div className="mt-5 space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (error && !settings) {
    return (
      <div className="space-y-5">
        <PageHeader title="Settings" description="School-wide rules for attendance, late calculation and face matching." />
        <Card>
          <ErrorState message={error} onRetry={() => void load()} />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Settings"
        description="School-wide rules for attendance, late calculation and face matching."
        meta={<span className="inline-flex items-center gap-1.5">
          <ShieldIcon className="h-3.5 w-3.5" />
          Admin only · changes apply to new scans immediately
        </span>}
        actions={
          <Button variant="outline" onClick={() => void load()} loading={loading && Boolean(settings)}>
            Reload
          </Button>
        }
      />

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {saveError ? <InlineAlert variant="error">{saveError}</InlineAlert> : null}

        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="School & schedule"
              description="Used to decide what counts as late and which days have attendance."
              actions={<span className="flex h-8 w-8 items-center justify-center rounded-lg bg-navy-50 text-navy-600"><GraduationCapIcon className="h-4 w-4" /></span>}
            />
            <CardContent className="space-y-4">
              <Field label="School name" htmlFor="schoolName" required error={errors.schoolName}>
                <Input
                  id="schoolName"
                  value={form.schoolName}
                  onChange={(event) => update('schoolName', event.target.value)}
                  invalid={Boolean(errors.schoolName)}
                  placeholder="Greenfield Secondary School"
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="School day starts" htmlFor="dayStartTime" required error={errors.dayStartTime}>
                  <Input
                    id="dayStartTime"
                    type="time"
                    value={form.dayStartTime}
                    onChange={(event) => update('dayStartTime', event.target.value)}
                    invalid={Boolean(errors.dayStartTime)}
                  />
                </Field>
                <Field
                  label="Late grace (minutes)"
                  htmlFor="lateGraceMinutes"
                  required
                  error={errors.lateGraceMinutes}
                  hint="Scans after start + grace are marked late."
                >
                  <Input
                    id="lateGraceMinutes"
                    type="number"
                    min={0}
                    max={120}
                    step={1}
                    value={form.lateGraceMinutes}
                    onChange={(event) => update('lateGraceMinutes', event.target.value)}
                    invalid={Boolean(errors.lateGraceMinutes)}
                  />
                </Field>
              </div>

              <Field label="Timezone" htmlFor="timezone" required error={errors.timezone} hint="Dates and late calculations use this timezone.">
                <Select id="timezone" value={form.timezone} onChange={(event) => update('timezone', event.target.value)}>
                  {timezoneOptions.map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </Select>
              </Field>

              <div>
                <p className="field-label">School days</p>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((day) => {
                    const selected = form.schoolDays.includes(day.value);
                    return (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => toggleSchoolDay(day.value)}
                        aria-pressed={selected}
                        title={day.label}
                        className={`focus-ring inline-flex h-10 w-12 items-center justify-center rounded-lg border text-sm font-semibold transition ${
                          selected
                            ? 'border-brand-500 bg-brand-50 text-brand-700'
                            : 'border-slate-300 bg-white text-slate-500 hover:border-slate-400'
                        }`}
                      >
                        {day.short}
                      </button>
                    );
                  })}
                </div>
                {errors.schoolDays ? (
                  <p className="mt-1.5 text-xs font-medium text-rose-600" role="alert">
                    {errors.schoolDays}
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs text-slate-500">Absences are only counted on selected school days.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-5">
            <Card>
              <CardHeader
                title="Face matching"
                description="Controls how confidently a kiosk scan must match an enrolled face."
                actions={<span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><SparkIcon className="h-4 w-4" /></span>}
              />
              <CardContent className="space-y-4">
                <Field
                  label="Match threshold"
                  htmlFor="faceMatchThreshold"
                  required
                  error={errors.faceMatchThreshold}
                  hint={thresholdHint}
                >
                  <div className="flex items-center gap-3">
                    <input
                      id="faceMatchThreshold"
                      type="range"
                      min={0.3}
                      max={0.95}
                      step={0.01}
                      value={Number.isFinite(thresholdNumber) ? thresholdNumber : 0.6}
                      onChange={(event) => update('faceMatchThreshold', Number(event.target.value).toFixed(2))}
                      className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-slate-200 accent-brand-600"
                      aria-valuemin={0.3}
                      aria-valuemax={0.95}
                      aria-valuenow={Number.isFinite(thresholdNumber) ? thresholdNumber : 0.6}
                    />
                    <input
                      type="number"
                      min={0.3}
                      max={0.95}
                      step={0.01}
                      value={form.faceMatchThreshold}
                      onChange={(event) => update('faceMatchThreshold', event.target.value)}
                      className="field-input w-24"
                      aria-label="Face match threshold value"
                    />
                  </div>
                </Field>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                  <p className="flex items-center gap-1.5 font-semibold text-slate-600">
                    <AlertIcon className="h-3.5 w-3.5" />
                    Tuning advice
                  </p>
                  <p className="mt-1 leading-relaxed">
                    Lower values accept more scans but risk false matches. Test with real staff and students on the actual gate cameras before
                    lowering this below 0.60.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader title="Current rules" description="A quick summary of the saved configuration." />
              <CardContent>
                <dl className="space-y-2.5 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="inline-flex items-center gap-1.5 text-slate-500">
                      <ClockIcon className="h-4 w-4" /> School starts
                    </dt>
                    <dd className="font-semibold text-slate-900 tabular">{settings?.dayStartTime ?? form.dayStartTime}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-slate-500">Late after</dt>
                    <dd className="font-semibold text-slate-900 tabular">
                      {settings ? `${settings.lateGraceMinutes} min grace` : `${form.lateGraceMinutes} min grace`}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-slate-500">Threshold</dt>
                    <dd className="font-semibold text-slate-900 tabular">
                      {(settings?.faceMatchThreshold ?? Number(form.faceMatchThreshold)).toFixed(2)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="inline-flex items-center gap-1.5 text-slate-500">
                      <GlobeIcon className="h-4 w-4" /> Timezone
                    </dt>
                    <dd className="truncate font-semibold text-slate-900">{settings?.timezone ?? form.timezone}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-slate-500">School days</dt>
                    <dd className="text-right font-semibold text-slate-900">
                      {WEEKDAYS.filter((day) => form.schoolDays.includes(day.value))
                        .map((day) => day.short)
                        .join(', ') || '—'}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/95 px-5 py-3.5 shadow-card backdrop-blur">
          <p className="text-xs text-slate-500">
            {settings ? `Editing settings for ${settings.schoolName}` : 'Loading current settings…'}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                if (settings) {
                  setForm(toForm(settings));
                  setErrors({});
                  setSaveError(null);
                }
              }}
              disabled={saving}
            >
              Reset changes
            </Button>
            <Button type="submit" loading={saving} leftIcon={<PencilIcon className="h-4 w-4" />}>
              Save settings
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
