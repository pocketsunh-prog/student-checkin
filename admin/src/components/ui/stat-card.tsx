import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from './skeleton';

export type StatTone = 'brand' | 'amber' | 'rose' | 'navy' | 'sky';

const TONES: Record<StatTone, { iconWrap: string; value: string }> = {
  brand: { iconWrap: 'bg-brand-50 text-brand-600', value: 'text-slate-900' },
  amber: { iconWrap: 'bg-amber-50 text-amber-600', value: 'text-slate-900' },
  rose: { iconWrap: 'bg-rose-50 text-rose-600', value: 'text-slate-900' },
  navy: { iconWrap: 'bg-navy-100 text-navy-700', value: 'text-slate-900' },
  sky: { iconWrap: 'bg-sky-50 text-sky-600', value: 'text-slate-900' },
};

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'navy',
  loading = false,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: StatTone;
  loading?: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {icon ? (
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', TONES[tone].iconWrap)}>
            {icon}
          </span>
        ) : null}
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-20" />
      ) : (
        <p className={cn('mt-1 text-3xl font-bold tracking-tight tabular', TONES[tone].value)}>{value}</p>
      )}
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </div>
  );
}
