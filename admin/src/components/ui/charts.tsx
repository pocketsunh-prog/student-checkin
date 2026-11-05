'use client';

import { cn, formatShortDate } from '@/lib/utils';
import type { DayReportRow, TrendPoint } from '@/lib/types';

interface BarDatum {
  date: string;
  present: number;
  late: number;
  absent: number;
}

export function AttendanceBars({
  points,
  height = 150,
  className,
}: {
  points: Array<TrendPoint | DayReportRow>;
  height?: number;
  className?: string;
}) {
  const data: BarDatum[] = points.map((point) => ({
    date: point.date,
    present: point.present,
    late: point.late,
    absent: point.absent,
  }));

  const max = Math.max(1, ...data.map((point) => point.present + point.late + point.absent));
  const labelEvery = Math.max(1, Math.ceil(data.length / 7));

  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-end gap-1.5 sm:gap-2" style={{ height }} role="img" aria-label="Attendance by day">
        {data.map((point, index) => {
          const total = point.present + point.late + point.absent;
          const totalHeight = Math.max(3, Math.round((total / max) * height));
          const presentHeight = total === 0 ? 0 : Math.round((point.present / max) * height);
          const lateHeight = total === 0 ? 0 : Math.round((point.late / max) * height);
          const absentHeight = Math.max(0, totalHeight - presentHeight - lateHeight);
          return (
            <div key={point.date} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end">
              <div
                className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-navy-900 px-2 py-1 text-[11px] text-white shadow-lg group-hover:block"
                role="tooltip"
              >
                {formatShortDate(point.date)} · P{point.present} · L{point.late} · A{point.absent}
              </div>
              <div className="flex w-full flex-col justify-end overflow-hidden rounded-t-[3px]" style={{ height: totalHeight }}>
                {absentHeight > 0 ? <div className="w-full bg-rose-200" style={{ height: absentHeight }} /> : null}
                {lateHeight > 0 ? <div className="w-full bg-amber-400" style={{ height: lateHeight }} /> : null}
                {presentHeight > 0 ? (
                  <div className="w-full bg-brand-500 transition-colors group-hover:bg-brand-600" style={{ height: presentHeight }} />
                ) : null}
              </div>
              {index % labelEvery === 0 || index === data.length - 1 ? (
                <span className="mt-1.5 truncate text-center text-[10px] text-slate-400">
                  {point.date.slice(5).replace('-', '/')}
                </span>
              ) : (
                <span className="mt-1.5 h-[13px]" aria-hidden="true" />
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
        <Legend color="bg-brand-500" label="Present" />
        <Legend color="bg-amber-400" label="Late" />
        <Legend color="bg-rose-200" label="Absent" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('h-2.5 w-2.5 rounded-sm', color)} aria-hidden="true" />
      {label}
    </span>
  );
}

export function RateRing({ value, size = 96, stroke = 9 }: { value: number; size?: number; stroke?: number }) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (clamped / 100) * circumference;
  const color = clamped >= 95 ? '#059669' : clamped >= 85 ? '#d97706' : '#e11d48';

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          className="transition-all duration-500"
        />
      </svg>
      <span className="absolute text-center">
        <span className="block text-lg font-bold leading-none text-slate-900 tabular">{clamped.toFixed(1)}%</span>
        <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-wide text-slate-400">Rate</span>
      </span>
    </div>
  );
}

export function ProgressBar({ value, tone = 'brand', className }: { value: number; tone?: 'brand' | 'amber' | 'rose'; className?: string }) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const color = tone === 'brand' ? 'bg-brand-500' : tone === 'amber' ? 'bg-amber-500' : 'bg-rose-500';
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-slate-100', className)} role="progressbar" aria-valuenow={Math.round(clamped)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn('h-full rounded-full transition-all duration-500', color)} style={{ width: `${clamped}%` }} />
    </div>
  );
}
