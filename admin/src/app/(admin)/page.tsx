'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, apiErrorMessage } from '@/lib/api';
import type { DashboardData, RecentScan } from '@/lib/types';
import { formatDate, formatDateTime, formatTime, percent, rateTone, relativeTime, scanActionLabel, statusTone, todayISO } from '@/lib/utils';
import { useToast } from '@/lib/toast';
import {
  AlertIcon,
  ArrowRightIcon,
  CalendarIcon,
  ChartIcon,
  CheckCircleIcon,
  ClipboardCheckIcon,
  ClockIcon,
  DeviceIcon,
  RefreshIcon,
  UsersIcon,
} from '@/components/icons';
import { Button, IconButton } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { AttendanceBars, ProgressBar, RateRing } from '@/components/ui/charts';
import { PageHeader } from '@/components/ui/page-header';
import { Badge, AttendanceBadge } from '@/components/ui/badge';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

const AUTO_REFRESH_MS = 60_000;

const QUICK_LINKS = [
  {
    href: '/attendance',
    title: 'Daily attendance',
    description: 'Correct records and export the register',
    icon: <ClipboardCheckIcon className="h-5 w-5" />,
  },
  {
    href: '/reports',
    title: 'Reports',
    description: 'Attendance rates by day and by student',
    icon: <ChartIcon className="h-5 w-5" />,
  },
  {
    href: '/students',
    title: 'Students',
    description: 'Enrol faces and manage student records',
    icon: <UsersIcon className="h-5 w-5" />,
  },
  {
    href: '/devices',
    title: 'Kiosk devices',
    description: 'Add a gate tablet and manage its API key',
    icon: <DeviceIcon className="h-5 w-5" />,
  },
];

function scanTone(action: RecentScan['action']): 'brand' | 'sky' | 'slate' {
  if (action === 'CHECK_IN') return 'brand';
  if (action === 'CHECK_OUT') return 'sky';
  return 'slate';
}

export default function DashboardPage() {
  const today = todayISO();
  const [date, setDate] = useState(today);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const requestId = useRef(0);
  const toast = useToast();

  const load = useCallback(
    async (quiet = false) => {
      const id = requestId.current + 1;
      requestId.current = id;
      if (quiet) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const result = await api.get<DashboardData>('/dashboard', { date });
        if (id !== requestId.current) return;
        setData(result);
        setLastUpdated(new Date());
      } catch (loadError) {
        if (id !== requestId.current) return;
        setError(apiErrorMessage(loadError));
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [date],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(true);
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  function changeDate(value: string) {
    if (!value || value === date) return;
    setData(null);
    setDate(value);
  }

  const stats = data?.stats;
  const isFirstLoad = loading && !data;
  const scans = data?.recentScans ?? [];
  const trend = data?.lateTrend ?? [];
  const showingToday = date === today;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={
          showingToday
            ? 'Today at a glance — attendance is synced with every kiosk scan.'
            : `Attendance for ${formatDate(date)}.`
        }
        meta={
          <>
            <span className="inline-flex items-center gap-1.5">
              <ClockIcon className="h-3.5 w-3.5" />
              {lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Not loaded yet'}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <RefreshIcon className="h-3 w-3" />
              Auto-refreshes every 60s
            </span>
          </>
        }
        actions={
          <>
            <label className="sr-only" htmlFor="dashboard-date">
              Dashboard date
            </label>
            <input
              id="dashboard-date"
              type="date"
              value={date}
              max={today}
              onChange={(event) => changeDate(event.target.value)}
              className="field-input w-auto py-2"
            />
            {!showingToday ? (
              <Button variant="outline" size="md" onClick={() => changeDate(today)} leftIcon={<CalendarIcon className="h-4 w-4" />}>
                Today
              </Button>
            ) : null}
            <Button
              variant="outline"
              onClick={() => {
                void load(true);
                toast.info('Refreshing dashboard', 'Fetching the latest attendance figures.');
              }}
              loading={refreshing}
              leftIcon={<RefreshIcon className="h-4 w-4" />}
            >
              Refresh
            </Button>
          </>
        }
      />

      {error ? (
        <Card>
          <ErrorState message={error} onRetry={() => void load()} />
        </Card>
      ) : null}

      {!error ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Present"
              value={stats?.present ?? 0}
              hint={stats ? `${percent((stats.present / Math.max(1, stats.totalStudents)) * 100)} of ${stats.totalStudents} students` : undefined}
              loading={isFirstLoad}
              tone="brand"
              icon={<CheckCircleIcon className="h-5 w-5" />}
            />
            <StatCard
              label="Late"
              value={stats?.late ?? 0}
              hint="Arrived after the grace period"
              loading={isFirstLoad}
              tone="amber"
              icon={<ClockIcon className="h-5 w-5" />}
            />
            <StatCard
              label="Absent"
              value={stats?.absent ?? 0}
              hint="No check-in recorded today"
              loading={isFirstLoad}
              tone="rose"
              icon={<AlertIcon className="h-5 w-5" />}
            />
            <StatCard
              label="Checked out"
              value={stats?.checkedOut ?? 0}
              hint="Students who have left school"
              loading={isFirstLoad}
              tone="sky"
              icon={<ArrowRightIcon className="h-5 w-5" />}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader title="Attendance today" description={formatDate(data?.date ?? date)} />
              <CardContent className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:justify-between">
                {isFirstLoad ? (
                  <>
                    <Skeleton className="h-24 w-24 rounded-full" />
                    <div className="w-full space-y-2">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-2/3" />
                    </div>
                  </>
                ) : (
                  <>
                    <RateRing value={stats?.checkInRate ?? 0} size={104} />
                    <dl className="w-full space-y-2.5 text-sm">
                      <div className="flex items-center justify-between gap-4">
                        <dt className="text-slate-500">Total students</dt>
                        <dd className="font-semibold text-slate-900 tabular">{stats?.totalStudents ?? '—'}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <dt className="text-slate-500">Present + late</dt>
                        <dd className="font-semibold text-slate-900 tabular">
                          {(stats?.present ?? 0) + (stats?.late ?? 0)}
                        </dd>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <dt className="text-slate-500">Check-in rate</dt>
                        <dd className={cn('font-semibold tabular', rateTone(stats?.checkInRate ?? 0))}>
                          {percent(stats?.checkInRate)}
                        </dd>
                      </div>
                      <div className="pt-1">
                        <ProgressBar value={stats?.checkInRate ?? 0} />
                      </div>
                    </dl>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader
                title="Attendance trend"
                description="Last 14 school days — stacked by status"
                actions={
                  <Link
                    href="/reports"
                    className="focus-ring inline-flex items-center gap-1 rounded text-xs font-semibold text-brand-700 hover:underline"
                  >
                    Full reports
                    <ArrowRightIcon className="h-3.5 w-3.5" />
                  </Link>
                }
              />
              <CardContent>
                {isFirstLoad ? (
                  <div className="flex h-[180px] items-end gap-2">
                    {Array.from({ length: 12 }).map((_, index) => (
                      <Skeleton key={index} className="flex-1" style={{ height: `${30 + ((index * 37) % 110)}px` }} />
                    ))}
                  </div>
                ) : trend.length === 0 ? (
                  <EmptyState
                    title="No trend data yet"
                    description="Trend data appears once attendance is recorded on school days."
                    className="py-8"
                  />
                ) : (
                  <AttendanceBars points={trend} height={180} />
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader
                title="Recent scans"
                description="Latest kiosk activity today"
                actions={
                  <Link
                    href="/attendance"
                    className="focus-ring inline-flex items-center gap-1 rounded text-xs font-semibold text-brand-700 hover:underline"
                  >
                    View register
                    <ArrowRightIcon className="h-3.5 w-3.5" />
                  </Link>
                }
              />
              <div className="divide-y divide-slate-100">
                {isFirstLoad ? (
                  Array.from({ length: 5 }).map((_, index) => (
                    <div key={index} className="flex items-center gap-3 px-5 py-3">
                      <Skeleton className="h-9 w-9 rounded-full" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-3.5 w-40" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </div>
                  ))
                ) : scans.length === 0 ? (
                  <EmptyState
                    icon={<ClockIcon className="h-6 w-6" />}
                    title="No scans yet"
                    description="Kiosk check-ins and check-outs will appear here in real time."
                    className="py-10"
                  />
                ) : (
                  scans.slice(0, 8).map((scan) => (
                    <div key={`${scan.studentId}-${scan.at}-${scan.action}`} className="flex items-center gap-3 px-5 py-3">
                      <UserAvatar name={scan.fullName} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">{scan.fullName}</p>
                        <p className="truncate text-xs text-slate-500">
                          {scan.studentId} · {scan.device || 'Kiosk'}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Badge tone={scanTone(scan.action)}>{scanActionLabel(scan.action)}</Badge>
                        <span className="text-[11px] text-slate-400" title={formatDateTime(scan.at)}>
                          {relativeTime(scan.at)}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>

            <Card>
              <CardHeader title="Quick actions" description="Jump to the most-used screens" />
              <div className="divide-y divide-slate-100">
                {QUICK_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="focus-ring group flex items-start gap-3 px-5 py-3.5 transition hover:bg-slate-50"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-navy-50 text-navy-600 transition group-hover:bg-brand-50 group-hover:text-brand-600">
                      {link.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-900">{link.title}</span>
                      <span className="block text-xs text-slate-500">{link.description}</span>
                    </span>
                    <ArrowRightIcon className="mt-2 h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-brand-600" />
                  </Link>
                ))}
              </div>
            </Card>
          </div>

          {!isFirstLoad && stats ? (
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-slate-400">
              <span>
                Present {stats.present} · Late {stats.late} · Absent {stats.absent} · Checked out {stats.checkedOut}
              </span>
              <span className="inline-flex items-center gap-1">
                <AttendanceBadge status="PRESENT" /> marked from face scans
              </span>
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
