'use client';

import { cn } from '@/lib/utils';
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/icons';

export function Pagination({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50, 100],
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}) {
  const safeTotalPages = Math.max(1, totalPages || 1);
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const pages: number[] = [];
  const windowSize = 5;
  let start = Math.max(1, page - Math.floor(windowSize / 2));
  const end = Math.min(safeTotalPages, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);
  for (let index = start; index <= end; index += 1) pages.push(index);

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 px-1 py-3', className)}>
      <div className="flex items-center gap-3 text-sm text-slate-500">
        <span>
          Showing <span className="font-semibold text-slate-700 tabular">{from}</span>–
          <span className="font-semibold text-slate-700 tabular">{to}</span> of{' '}
          <span className="font-semibold text-slate-700 tabular">{total}</span>
        </span>
        {onPageSizeChange ? (
          <label className="hidden items-center gap-1.5 sm:flex">
            <span className="sr-only">Rows per page</span>
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="focus-ring rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-600"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size} / page
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <nav className="flex items-center gap-1" aria-label="Pagination">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="focus-ring inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeftIcon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Prev</span>
        </button>
        {pages.map((pageNumber) => (
          <button
            key={pageNumber}
            type="button"
            onClick={() => onPageChange(pageNumber)}
            aria-current={pageNumber === page ? 'page' : undefined}
            className={cn(
              'focus-ring inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-xs font-semibold transition tabular',
              pageNumber === page
                ? 'border-navy-900 bg-navy-900 text-white'
                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            {pageNumber}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= safeTotalPages}
          className="focus-ring inline-flex h-8 items-center gap-1 rounded-md border border-slate-300 bg-white px-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="hidden sm:inline">Next</span>
          <ChevronRightIcon className="h-3.5 w-3.5" />
        </button>
      </nav>
    </div>
  );
}
