import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes, HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from './skeleton';
import { EmptyState } from './states';

export function TableContainer({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn('overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-card', className)}>
      <table className="min-w-full divide-y divide-slate-100 text-left">{children}</table>
    </div>
  );
}

export function THead({ children, className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={cn('bg-slate-50/80', className)} {...rest}>
      {children}
    </thead>
  );
}

export function TBody({ children, className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={cn('divide-y divide-slate-100 bg-white', className)} {...rest}>
      {children}
    </tbody>
  );
}

export function TR({ children, className, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn('transition-colors hover:bg-slate-50/70', className)} {...rest}>
      {children}
    </tr>
  );
}

export function TH({ children, className, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th scope="col" className={cn('table-head', className)} {...rest}>
      {children}
    </th>
  );
}

export function TD({ children, className, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn('table-cell', className)} {...rest}>
      {children}
    </td>
  );
}

export function TableEmpty({
  colSpan,
  title,
  description,
  action,
  icon,
}: {
  colSpan: number;
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="p-0">
        <EmptyState title={title} description={description} action={action} icon={icon} />
      </td>
    </tr>
  );
}

export function TableSkeleton({ columns, rows = 6 }: { columns: number; rows?: number }) {
  return (
    <TBody aria-hidden="true">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr key={rowIndex} className="border-b border-slate-100 last:border-0">
          {Array.from({ length: columns }).map((__, colIndex) => (
            <td key={colIndex} className="px-4 py-3.5">
              <Skeleton className={cn('h-4', colIndex === 0 ? 'w-40' : 'w-20')} />
            </td>
          ))}
        </tr>
      ))}
    </TBody>
  );
}
