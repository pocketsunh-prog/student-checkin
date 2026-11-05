'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, apiErrorMessage } from '@/lib/api';
import type { MetaOptions, ReportSummary, StudentReportRow } from '@/lib/types';
import { cn, daysAgoISO, formatDate, formatShortDate, percent, rateTone, todayISO } from '@/lib/utils';
import { useToast } from '@/lib/toast';
import {
  AlertIcon,
  CalendarIcon,
  ChartIcon,
  CheckCircleIcon,
  ClockIcon,
  DownloadIcon,
  RefreshIcon,
  UsersIcon,
} from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { TBody, TD, TH, THead, TableContainer, TableEmpty, TableSkeleton, TR } from '@/components/ui/table';
import { EmptyState, ErrorState, InlineAlert } from '@/components/ui/states';
import { AttendanceBars } from '@/components/ui/charts';
import { StatCard } from '@/components/ui/stat-card';
import { Tabs } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';

type StudentView = 'all' | 'late' | 'absent';

export default function ReportsPage() {
  const toast = useToast();

  const [from, setFrom] = useState(daysAgoISO(14));
  const [to, setTo] = useState(todayISO());
  const [classFilter, setClassFilter] = useState('');
  const [formFilter, setFormFilter] = useState('');
  const [activeTab, setActiveTab] = useState<'daily' | 'students'>('daily');
  const [studentView, setStudentView] = useState<StudentView>('all');

  const [report, setReport] = useState<ReportSummary | null>(null);
  const [meta, setMeta] = useState<MetaOptions>({ classes: [], forms: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const requestId = useRef(0);

  const rangeInvalid = !from || !to || from > to;

  useEffect(() => {
    api
      .get<MetaOptions>('/students/meta/options')
      .then((options) => setMeta({ classes: options.classes ?? [], forms: options.forms ?? [] }))
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    if (rangeInvalid) {
      setLoading(false);
      return;
    }
    const id = requestId.current + 1;
    requestId.current = id;
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<ReportSummary>('/reports/summary', {
        from,
        to,
        class: classFilter || undefined,
        form: formFilter || undefined,
      });
      if (id !== requestId.current) return;
      setReport(result);
    } catch (loadError) {
      if (id !== requestId.current) return;
      setError(apiErrorMessage(loadError));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [from, to, classFilter, formFilter, rangeInvalid]);

  useEffect(() => {
    void load();
  }, [load]);

  function applyPreset(preset: 'week' | 'month' | '30days' | 'term') {
    const today = todayISO();
    setTo(today);
    if (preset === 'week') setFrom(daysAgoISO(6));
    if (preset === 'month') setFrom(daysAgoISO(29));
    if (preset === '30days') setFrom(daysAgoISO(30));
    if (preset === 'term') setFrom(daysAgoISO(89));
  }

  async function exportCsv() {
    if (rangeInvalid) return;
    setExporting(true);
    try {
      await api.download(
        '/attendance/export',
        {
          from,
          to,
          class: classFilter || undefined,
          form: formFilter || undefined,
          format: 'csv',
        },
        `attendance-report-${from}_to_${to}.csv`,
      );
      toast.success('Export ready', 'The filtered attendance report was downloaded as CSV.');
    } catch (exportError) {
      toast.error('Export failed', apiErrorMessage(exportError));
    } finally {
      setExporting(false);
    }
  }

  const totals = report?.totals;
  const days = report?.days ?? [];
  const students = report?.students ?? [];
  const isFirstLoad = loading && !report;

  const filteredStudents = students.filter((student) => {
    if (studentView === 'late') return student.late > 0;
    if (studentView === 'absent') return student.absent > 0;
    return true;
  });

  const studentsWithLate = students.filter((student) => student.late > 0).length;
  const studentsWithAbsence = students.filter((student) => student.absent > 0).length;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        description="Attendance rates for a date range, broken down by day and by student."
        meta={
          report ? (
            <span className="inline-flex items-center gap-1.5">
              <CalendarIcon className="h-3.5 w-3.5" />
              {formatDate(report.from)} – {formatDate(report.to)}
            </span>
          ) : undefined
        }
        actions={
          <>
            <Button variant="outline" onClick={() => void load()} loading={loading && Boolean(report)} leftIcon={<RefreshIcon className="h-4 w-4" />}>
              Refresh
            </Button>
            <Button onClick={() => void exportCsv()} loading={exporting} disabled={rangeInvalid} leftIcon={<DownloadIcon className="h-4 w-4" />}>
              Export CSV
            </Button>
          </>
        }
      />

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="report-from" className="field-label">
              From
            </label>
            <Input
              id="report-from"
              type="date"
              value={from}
              max={todayISO()}
              onChange={(event) => setFrom(event.target.value)}
              invalid={Boolean(from && to && from > to)}
            />
          </div>
          <div>
            <label htmlFor="report-to" className="field-label">
              To
            </label>
            <Input
              id="report-to"
              type="date"
              value={to}
              max={todayISO()}
              onChange={(event) => setTo(event.target.value)}
              invalid={Boolean(from && to && from > to)}
            />
          </div>
          <div>
            <label htmlFor="report-class" className="field-label">
              Class
            </label>
            <Select id="report-class" value={classFilter} onChange={(event) => setClassFilter(event.target.value)}>
              <option value="">All classes</option>
              {meta.classes.map((className) => (
                <option key={className} value={className}>
                  Class {className}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="report-form" className="field-label">
              Form
            </label>
            <Select id="report-form" value={formFilter} onChange={(event) => setFormFilter(event.target.value)}>
              <option value="">All forms</option>
              {meta.forms.map((formName) => (
                <option key={formName} value={formName}>
                  {formName}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500">Quick ranges:</span>
          <PresetButton label="Last 7 days" onClick={() => applyPreset('week')} />
          <PresetButton label="Last 30 days" onClick={() => applyPreset('month')} />
          <PresetButton label="Last 90 days" onClick={() => applyPreset('term')} />
        </div>
        {rangeInvalid ? (
          <div className="mt-3">
            <InlineAlert variant="error">The start date must be on or before the end date.</InlineAlert>
          </div>
        ) : null}
      </Card>

      {error ? (
        <Card>
          <ErrorState message={error} onRetry={() => void load()} />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard
              label="Student days"
              value={totals?.studentDays ?? 0}
              hint="Student × school-day records"
              loading={isFirstLoad}
              tone="navy"
              icon={<UsersIcon className="h-5 w-5" />}
            />
            <StatCard
              label="Present"
              value={totals?.present ?? 0}
              loading={isFirstLoad}
              tone="brand"
              icon={<CheckCircleIcon className="h-5 w-5" />}
            />
            <StatCard label="Late" value={totals?.late ?? 0} loading={isFirstLoad} tone="amber" icon={<ClockIcon className="h-5 w-5" />} />
            <StatCard label="Absent" value={totals?.absent ?? 0} loading={isFirstLoad} tone="rose" icon={<AlertIcon className="h-5 w-5" />} />
            <StatCard
              label="Attendance rate"
              value={percent(totals?.attendanceRate)}
              hint="Present + late, as a share of student days"
              loading={isFirstLoad}
              tone="sky"
              icon={<ChartIcon className="h-5 w-5" />}
            />
          </div>

          <Tabs
            value={activeTab}
            onChange={(id) => setActiveTab(id as 'daily' | 'students')}
            items={[
              { id: 'daily', label: 'By day', count: days.length, icon: <CalendarIcon className="h-4 w-4" /> },
              { id: 'students', label: 'By student', count: students.length, icon: <UsersIcon className="h-4 w-4" /> },
            ]}
            className="max-w-md"
          />

          {activeTab === 'daily' ? (
            <div className="space-y-4">
              <Card>
                <CardHeader title="Daily attendance" description="Stacked daily totals with present, late and absent students" />
                <CardContent>
                  {isFirstLoad ? (
                    <div className="flex h-[170px] items-end gap-2">
                      {Array.from({ length: 14 }).map((_, index) => (
                        <Skeleton key={index} className="flex-1" style={{ height: `${30 + ((index * 43) % 120)}px` }} />
                      ))}
                    </div>
                  ) : days.length === 0 ? (
                    <EmptyState title="No school days in this range" description="Try a wider date range or a different class or form." className="py-8" />
                  ) : (
                    <AttendanceBars points={days} height={170} />
                  )}
                </CardContent>
              </Card>

              <TableContainer>
                <THead>
                  <TR>
                    <TH>Date</TH>
                    <TH>Present</TH>
                    <TH>Late</TH>
                    <TH>Absent</TH>
                    <TH>Total</TH>
                    <TH>Attendance rate</TH>
                  </TR>
                </THead>
                {isFirstLoad ? (
                  <TableSkeleton columns={6} rows={7} />
                ) : days.length === 0 ? (
                  <TBody>
                    <TableEmpty colSpan={6} title="No daily data" description="No attendance records fall inside this range." />
                  </TBody>
                ) : (
                  <TBody>
                    {days.map((day) => {
                      const rate = day.total > 0 ? ((day.present + day.late) / day.total) * 100 : 0;
                      return (
                        <TR key={day.date}>
                          <TD>
                            <span className="font-medium text-slate-800">{formatShortDate(day.date)}</span>
                            <span className="ml-2 text-xs text-slate-400">{day.date}</span>
                          </TD>
                          <TD className="tabular">{day.present}</TD>
                          <TD className="tabular">{day.late > 0 ? <span className="font-medium text-amber-700">{day.late}</span> : day.late}</TD>
                          <TD className="tabular">{day.absent > 0 ? <span className="font-medium text-rose-600">{day.absent}</span> : day.absent}</TD>
                          <TD className="tabular">{day.total}</TD>
                          <TD>
                            <div className="flex items-center gap-2">
                              <span className={cn('text-xs font-semibold tabular', rateTone(rate))}>{percent(rate)}</span>
                              <div className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-slate-100 sm:block">
                                <div
                                  className={cn('h-full rounded-full', rate >= 95 ? 'bg-brand-500' : rate >= 85 ? 'bg-amber-500' : 'bg-rose-500')}
                                  style={{ width: `${Math.min(100, rate)}%` }}
                                />
                              </div>
                            </div>
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                )}
              </TableContainer>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-slate-500">Show:</span>
                <FilterChip label={`All students (${students.length})`} active={studentView === 'all'} onClick={() => setStudentView('all')} />
                <FilterChip label={`With late arrivals (${studentsWithLate})`} active={studentView === 'late'} onClick={() => setStudentView('late')} />
                <FilterChip label={`With absences (${studentsWithAbsence})`} active={studentView === 'absent'} onClick={() => setStudentView('absent')} />
              </div>

              <TableContainer>
                <THead>
                  <TR>
                    <TH>Student</TH>
                    <TH>Class / form</TH>
                    <TH>Present</TH>
                    <TH>Late</TH>
                    <TH>Absent</TH>
                    <TH>Attendance rate</TH>
                  </TR>
                </THead>
                {isFirstLoad ? (
                  <TableSkeleton columns={6} rows={8} />
                ) : filteredStudents.length === 0 ? (
                  <TBody>
                    <TableEmpty
                      colSpan={6}
                      title={students.length === 0 ? 'No student data' : 'No students match this view'}
                      description={
                        students.length === 0
                          ? 'No attendance records fall inside this range.'
                          : 'Switch back to “All students” to see the full breakdown.'
                      }
                    />
                  </TBody>
                ) : (
                  <TBody>
                    {filteredStudents.map((student: StudentReportRow) => {
                      const total = student.present + student.late + student.absent;
                      const rate = total > 0 ? ((student.present + student.late) / total) * 100 : 0;
                      return (
                        <TR key={student.studentId}>
                          <TD>
                            <Link
                              href={`/students/${encodeURIComponent(student.studentId)}`}
                              className="focus-ring block max-w-[220px] truncate rounded font-semibold text-slate-900 hover:text-brand-700"
                            >
                              {student.fullName}
                            </Link>
                            <p className="font-mono text-xs text-slate-500">{student.studentId}</p>
                          </TD>
                          <TD>
                            <p className="font-medium text-slate-800">{student.class}</p>
                            <p className="text-xs text-slate-500">{student.form}</p>
                          </TD>
                          <TD className="tabular">{student.present}</TD>
                          <TD className="tabular">
                            {student.late > 0 ? <span className="font-medium text-amber-700">{student.late}</span> : student.late}
                          </TD>
                          <TD className="tabular">
                            {student.absent > 0 ? <span className="font-medium text-rose-600">{student.absent}</span> : student.absent}
                          </TD>
                          <TD>
                            <div className="flex items-center gap-2">
                              <span className={cn('text-xs font-semibold tabular', rateTone(rate))}>{percent(rate)}</span>
                              <div className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-slate-100 sm:block">
                                <div
                                  className={cn('h-full rounded-full', rate >= 95 ? 'bg-brand-500' : rate >= 85 ? 'bg-amber-500' : 'bg-rose-500')}
                                  style={{ width: `${Math.min(100, rate)}%` }}
                                />
                              </div>
                            </div>
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                )}
              </TableContainer>
            </div>
          )}
        </>
      )}

      <p className="px-1 text-xs text-slate-400">
        Attendance rate counts present and late students as attended. Absences are derived from active students on school days in settings.
      </p>
    </div>
  );
}

function PresetButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="focus-ring rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:border-brand-400 hover:text-brand-700"
    >
      {label}
    </button>
  );
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'focus-ring rounded-full border px-3 py-1 text-xs font-semibold transition',
        active
          ? 'border-navy-900 bg-navy-900 text-white'
          : 'border-slate-300 bg-white text-slate-600 hover:border-slate-400',
      )}
    >
      {label}
    </button>
  );
}
