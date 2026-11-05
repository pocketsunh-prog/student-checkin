'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  icon?: ReactNode;
}

export function Tabs({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1 no-scrollbar', className)} role="tablist">
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(item.id)}
            className={cn(
              'focus-ring inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition',
              selected ? 'bg-white text-navy-900 shadow-sm' : 'text-slate-500 hover:text-slate-800',
            )}
          >
            {item.icon}
            {item.label}
            {typeof item.count === 'number' ? (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular',
                  selected ? 'bg-brand-50 text-brand-700' : 'bg-slate-200 text-slate-600',
                )}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Horizontal underline tabs for page-level sections. */
export function TabLinks({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex gap-6 overflow-x-auto border-b border-slate-200 no-scrollbar', className)} role="tablist">
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(item.id)}
            className={cn(
              'focus-ring -mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 pb-3 pt-1 text-sm font-medium transition',
              selected
                ? 'border-brand-500 text-brand-700'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800',
            )}
          >
            {item.icon}
            {item.label}
            {typeof item.count === 'number' ? (
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 tabular">{item.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
