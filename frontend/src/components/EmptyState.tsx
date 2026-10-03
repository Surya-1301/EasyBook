import type { ReactNode } from 'react';
import { IconStethoscope } from './icons';

export function EmptyState({
  title,
  message,
  action,
  icon,
}: {
  title: string;
  message?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <div
        className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-400"
        aria-hidden
      >
        {icon ?? <IconStethoscope className="h-8 w-8" />}
      </div>
      <h3 className="text-base font-bold text-slate-900">{title}</h3>
      {message && <p className="mt-1 max-w-sm text-sm text-slate-500">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
