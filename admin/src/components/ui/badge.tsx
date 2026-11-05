import type { HTMLAttributes, ReactNode } from 'react';
import { cn, statusTone, studentStatusTone } from '@/lib/utils';
import type { AttendanceStatus, StudentStatus } from '@/lib/types';

export type BadgeTone = 'brand' | 'amber' | 'rose' | 'slate' | 'navy' | 'violet' | 'sky';

const TONES: Record<BadgeTone, string> = {
  brand: 'border-brand-200 bg-brand-50 text-brand-700',
  amber: 'border-amber-200 bg-amber-50 text-amber-700',
  rose: 'border-rose-200 bg-rose-50 text-rose-700',
  slate: 'border-slate-200 bg-slate-50 text-slate-600',
  navy: 'border-navy-200 bg-navy-50 text-navy-700',
  violet: 'border-violet-200 bg-violet-50 text-violet-700',
  sky: 'border-sky-200 bg-sky-50 text-sky-700',
};

const DOTS: Record<BadgeTone, string> = {
  brand: 'bg-brand-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  slate: 'bg-slate-400',
  navy: 'bg-navy-500',
  violet: 'bg-violet-500',
  sky: 'bg-sky-500',
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  dot?: boolean;
  children: ReactNode;
}

export function Badge({ tone = 'slate', dot = false, className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        TONES[tone],
        className,
      )}
      {...rest}
    >
      {dot ? <span className={cn('h-1.5 w-1.5 rounded-full', DOTS[tone])} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

const STATUS_TONE_MAP: Record<string, BadgeTone> = {
  PRESENT: 'brand',
  LATE: 'amber',
  ABSENT: 'rose',
};

export function AttendanceBadge({ status }: { status: AttendanceStatus | null | undefined }) {
  if (!status) return <Badge tone="slate">No record</Badge>;
  const tone = STATUS_TONE_MAP[status] ?? 'slate';
  return (
    <Badge tone={tone} dot>
      {statusTone(status).label}
    </Badge>
  );
}

export function StudentStatusBadge({ status }: { status: StudentStatus | null | undefined }) {
  return (
    <Badge tone={status === 'INACTIVE' ? 'slate' : 'brand'} dot>
      {studentStatusTone(status).label}
    </Badge>
  );
}

export function FaceEnrolledBadge({ enrolled }: { enrolled: boolean }) {
  return enrolled ? (
    <Badge tone="navy" dot>
      Face enrolled
    </Badge>
  ) : (
    <Badge tone="slate">No face</Badge>
  );
}
