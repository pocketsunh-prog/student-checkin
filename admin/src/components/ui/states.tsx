import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { AlertIcon, InfoIcon, RefreshIcon, SearchIcon } from '@/components/icons';
import { Button } from './button';
import { Spinner } from './skeleton';

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        {icon ?? <SearchIcon className="h-6 w-6" />}
      </div>
      <h3 className="mt-4 text-sm font-semibold text-slate-900">{title}</h3>
      {description ? <p className="mt-1 max-w-md text-sm text-slate-500">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = 'Could not load data',
  message,
  onRetry,
  className,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)} role="alert">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-500">
        <AlertIcon className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-slate-900">{title}</h3>
      {message ? <p className="mt-1 max-w-md text-sm text-slate-500">{message}</p> : null}
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-5" onClick={onRetry} leftIcon={<RefreshIcon className="h-4 w-4" />}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function LoadingState({ label = 'Loading…', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex items-center justify-center px-6 py-14', className)}>
      <Spinner label={label} className="h-5 w-5" />
    </div>
  );
}

export type AlertVariant = 'error' | 'warning' | 'success' | 'info';

const ALERT_STYLES: Record<AlertVariant, { wrap: string; icon: string }> = {
  error: { wrap: 'border-rose-200 bg-rose-50 text-rose-800', icon: 'text-rose-500' },
  warning: { wrap: 'border-amber-200 bg-amber-50 text-amber-800', icon: 'text-amber-500' },
  success: { wrap: 'border-brand-200 bg-brand-50 text-brand-800', icon: 'text-brand-600' },
  info: { wrap: 'border-sky-200 bg-sky-50 text-sky-800', icon: 'text-sky-500' },
};

export function InlineAlert({
  variant = 'info',
  title,
  children,
  className,
}: {
  variant?: AlertVariant;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const styles = ALERT_STYLES[variant];
  return (
    <div className={cn('flex items-start gap-3 rounded-lg border px-4 py-3 text-sm', styles.wrap, className)} role={variant === 'error' ? 'alert' : 'status'}>
      <span className={cn('mt-0.5 shrink-0', styles.icon)}>
        {variant === 'info' ? <InfoIcon className="h-4 w-4" /> : <AlertIcon className="h-4 w-4" />}
      </span>
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cn(title ? 'mt-0.5' : undefined)}>{children}</div> : null}
      </div>
    </div>
  );
}

/** Full-page centered loading screen used while the auth guard hydrates. */
export function FullPageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <Spinner label={label} className="h-6 w-6" />
    </div>
  );
}
