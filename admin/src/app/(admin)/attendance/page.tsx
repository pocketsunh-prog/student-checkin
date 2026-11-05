'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, apiErrorMessage } from '@/lib/api';
import type { AttendanceListResponse, AttendanceRow, AttendanceStatus, MetaOptions } from '@/lib/types';
import { cn, daysAgoISO, formatDate, formatDate as formatDateOnly, formatTime, percent, todayISO } from '@/lib/utils';
import { useToast } from '@/lib/toast';
import {
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  DownloadIcon,
  PencilIcon,
  RefreshIcon,
  SearchIcon,
  UsersIcon,
} from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Pagination as PaginationBar } from '@/components/ui/pagination';
import { TBody, TD, TH, THead, TableContainer, TableEmpty, TableSkeleton, TR } from '@/components/ui/table';
import { AttendanceBadge } from '@/components/ui/badge';
import { ErrorState } from '@/components/ui/states';
import { UserAvatar } from '@/components/ui/avatar';
import { AttendanceCorrectionModal } from '@/components/attendance/correction-modal';

type StatusFilter = '' | AttendanceStatus;

export default function AttendancePage() {
  const toast = useToast();

  const [date, setDate] = useState(todayISO());
  const [studentIdInput, setStudentIdInput] = useState('');
  const [studentIdFilter, setStudentIdFilter] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [formFilter, setFormFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [data, setData] = useState<AttendanceListResponse | null>(null);
  const [meta, setMeta] = useState<MetaOptions>({ classes: [], forms: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [correctionRow, setCorrectionRow] = useState<AttendanceRow | null>(null);
  const requestId = useRef(0);

  // Deep link from the student profile: /attendance?studentId=STU001
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const studentId = params.get('studentId');
    if (studentId) {
      setStudentIdInput(studentId);
      setStudentIdFilter(studentId);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = studentIdInput.trim();
      setStudentIdFilter((current) => {
        if (current === next) return current;
        setPage(1);
        return next;
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [studentIdInput]);

  useEffect(() => {
    api
      .get<MetaOptions>('/students/meta/options')
      .then((options) => setMeta({ classes: options.classes ?? [], forms: options.forms ?? [] }))
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    const id = requestId.current + 1;
    requestId.current = id;
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<AttendanceListResponse>('/attendance', {
        date,
        class: classFilter || undefined,
        form: formFilter || undefined,
        status: statusFilter || undefined,
        studentId: studentIdFilter || undefined,
        page,
        pageSize,
      });
      if (id !== requestId.current) return;
      setData(result);
    } catch (loadError) {
      if (id !== requestId.current) return;
      setError(apiErrorMessage(loadError));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [date, classFilter, formFilter, statusFilter, studentIdFilter, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  function changeDate(next: string) {
    if (!next || next === date) return;
    setData(null);
    setPage(1);
    setDate(next);
  }

  function resetFilters() {
    setStudentIdInput('');
    setStudentIdFilter('');
    setClassFilter('');
    setFormFilter('');
    setStatusFilter('');
    setPage(1);
  }

  async function exportCsv() {
    setExporting(true);
    try {
      await api.download(
        '/attendance/export',
        {
          from: date,
          to: date,
          class: classFilter || undefined,
          form: formFilter || undefined,
          status: statusFilter || undefined,
          format: 'csv',
        },
        `attendance-${date}.csv`,
      );
      toast.success('Export ready', `Attendance for ${formatDate(date)} was downloaded as CSV.`);
    } catch (exportError) {
      toast.error('Export failed', apiErrorMessage(exportError));
    } finally {
      setExporting(false);
    }
  }

  const summary = data?.summary;
  const isToday = date === todayISO();
  const filtersActive = Boolean(studentIdFilter) || Boolean(classFilter) || Boolean(formFilter) || Boolean(statusFilter);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Daily attendance"
        description="Review, correct and export the attendance register for a single school day."
        meta={
          <>
            <span className="inline-flex items-center gap-1.5">
              <CalendarIcon className="h-3.5 w-3.5" />
              {formatDate(date)}
              {isToday ? ' · today' : ''}
            </span>
            {data ? (
              <span className="inline-flex items-center gap-1.5">
                <UsersIcon className="h-3.5 w-3.5" />
                {data.total} rows
              </span>
            ) : null}
          </>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => void load()} loading={loading && Boolean(data)} leftIcon={<RefreshIcon className="h-4 w-4" />}>
              Refresh
            </Button>
            <Button onClick={() => void exportCsv()} loading={exporting} leftIcon={<DownloadIcon className="h-4 w-4" />}>
              Export CSV
            </Button>
          </>
        }
      />

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="sm:col-span-2 lg:col-span-1">
            <label htmlFor="attendance-date" className="sr-only">
              Attendance date
            </label>
            <Input
              id="attendance-date"
              type="date"
              value={date}
              max={todayISO()}
              onChange={(event) => changeDate(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor="attendance-student" className="sr-only">
              Filter by student
            </label>
            <Input
              id="attendance-student"
              type="search"
              placeholder="Student ID…"
              value={studentIdInput}
              onChange={(event) => setStudentIdInput(event.target.value)}
              icon={<SearchIcon className="h-4 w-4" />}
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor="attendance-class" className="sr-only">
              Filter by class
            </label>
            <Select
              id="attendance-class"
              value={classFilter}
              onChange={(event) => {
                setClassFilter(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All classes</option>
              {meta.classes.map((className) => (
                <option key={className} value={className}>
                  Class {className}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="attendance-form" className="sr-only">
              Filter by form
            </label>
            <Select
              id="attendance-form"
              value={formFilter}
              onChange={(event) => {
                setFormFilter(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All forms</option>
              {meta.forms.map((formName) => (
                <option key={formName} value={formName}>
                  {formName}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label htmlFor="attendance-status" className="sr-only">
              Filter by status
            </label>
            <Select
              id="attendance-status"
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as StatusFilter);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              <option value="PRESENT">Present</option>
              <option value="LATE">Late</option>
              <option value="ABSENT">Absent</option>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => changeDate(todayISO())} disabled={isToday}>
              Today
            </Button>
            <Button variant="outline" size="sm" onClick={() => changeDate(daysAgoISO(1))} disabled={date === daysAgoISO(1)}>
              Yesterday
            </Button>
          </div>
        </div>
        {filtersActive ? (
          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-slate-500">
              {studentIdFilter ? (
                <>
                  Showing records for <span className="font-mono font-semibold">{studentIdFilter}</span>
                </>
              ) : (
                'Filters applied'
              )}
            </p>
            <button
              type="button"
              onClick={resetFilters}
              className="focus-ring rounded text-xs font-semibold text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : null}
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryChip label="Present" value={summary?.present} icon={<CheckCircleIcon className="h-4 w-4" />} tone="brand" loading={loading && !data} />
        <SummaryChip label="Late" value={summary?.late} icon={<ClockIcon className="h-4 w-4" />} tone="amber" loading={loading && !data} />
        <SummaryChip label="Absent" value={summary?.absent} icon={<UsersIcon className="h-4 w-4" />} tone="rose" loading={loading && !data} />
        <SummaryChip label="Checked out" value={summary?.checkedOut} icon={<RefreshIcon className="h-4 w-4" />} tone="sky" loading={loading && !data} />
        <SummaryChip
          label="Check-in rate"
          value={summary ? percent(summary.checkInRate) : undefined}
          icon={<CheckCircleIcon className="h-4 w-4" />}
          tone="navy"
          loading={loading && !data}
        />
      </div>

      <div>
        <TableContainer>
          <THead>
            <TR>
              <TH>Student</TH>
              <TH>Class / form</TH>
              <TH>Status</TH>
              <TH>Check in</TH>
              <TH>Check out</TH>
              <TH className="hidden sm:table-cell">Late</TH>
              <TH className="hidden lg:table-cell">Method</TH>
              <TH className="hidden xl:table-cell">Note</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          {loading && !data ? (
            <TableSkeleton columns={9} rows={8} />
          ) : error && !data ? (
            <TBody>
              <tr>
                <td colSpan={9} className="p-0">
                  <ErrorState message={error} onRetry={() => void load()} />
                </td>
              </tr>
            </TBody>
          ) : data && data.items.length === 0 ? (
            <TBody>
              <TableEmpty
                colSpan={9}
                title={filtersActive ? 'No attendance matches these filters' : 'No attendance for this day'}
                description={
                  filtersActive
                    ? 'Clear the filters or pick a different date.'
                    : 'Absences only appear for active students on school days. Kiosk check-ins will fill this register automatically.'
                }
                action={
                  filtersActive ? (
                    <Button variant="outline" size="sm" onClick={resetFilters}>
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            </TBody>
          ) : (
            <TBody>
              {data?.items.map((row, index) => (
                <TR key={row.id ?? `${row.studentId}-${row.date}-${index}`}>
                  <TD>
                    <div className="flex items-center gap-3">
                      <UserAvatar name={row.fullName} size="sm" />
                      <div className="min-w-0">
                        <Link
                          href={`/students/${encodeURIComponent(row.studentId)}`}
                          className="focus-ring block max-w-[200px] truncate rounded font-semibold text-slate-900 hover:text-brand-700"
                        >
                          {row.fullName}
                        </Link>
                        <p className="font-mono text-xs text-slate-500">{row.studentId}</p>
                      </div>
                    </div>
                  </TD>
                  <TD>
                    <p className="font-medium text-slate-800">{row.class}</p>
                    <p className="text-xs text-slate-500">{row.form}</p>
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
                  <TD className="hidden lg:table-cell">
                    <span className="text-xs font-medium text-slate-500">{row.method === 'FACE' ? 'Face scan' : 'Manual'}</span>
                  </TD>
                  <TD className="hidden xl:table-cell">
                    <span className="block max-w-[180px] truncate text-xs text-slate-500" title={row.note ?? undefined}>
                      {row.note || '—'}
                    </span>
                  </TD>
                  <TD className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setCorrectionRow(row)} leftIcon={<PencilIcon className="h-3.5 w-3.5" />}>
                      Correct
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          )}
        </TableContainer>

        {data ? (
          <PaginationBar
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            totalPages={data.totalPages}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        ) : null}
      </div>

      <p className="px-1 text-xs text-slate-400">
        Showing attendance for {formatDateOnly(date)}. Students without a check-in on a school day are listed as absent. CSV exports respect
        the current filters.
      </p>

      <AttendanceCorrectionModal
        open={Boolean(correctionRow)}
        row={correctionRow}
        onClose={() => setCorrectionRow(null)}
        onSaved={() => void load()}
      />
    </div>
  );
}

function SummaryChip({
  label,
  value,
  icon,
  tone,
  loading,
}: {
  label: string;
  value: number | string | undefined;
  icon: React.ReactNode;
  tone: 'brand' | 'amber' | 'rose' | 'sky' | 'navy';
  loading: boolean;
}) {
  const tones = {
    brand: 'bg-brand-50 text-brand-600',
    amber: 'bg-amber-50 text-amber-600',
    rose: 'bg-rose-50 text-rose-600',
    sky: 'bg-sky-50 text-sky-600',
    navy: 'bg-navy-50 text-navy-600',
  } as const;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-card">
      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', tones[tone])}>{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <p className="text-lg font-bold leading-tight text-slate-900 tabular">
          {loading ? <span className="inline-block h-5 w-8 animate-pulse rounded bg-slate-200" /> : (value ?? '—')}
        </p>
      </div>
    </div>
  );
}
