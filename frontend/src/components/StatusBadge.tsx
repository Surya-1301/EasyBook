import { AppointmentStatus, QueueStatus } from '../api/types';

const styles: Record<string, string> = {
  // appointment
  HELD: 'bg-slate-100 text-slate-700 border-slate-300',
  BOOKED: 'bg-sky-100 text-sky-800 border-sky-300',
  CONFIRMED: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  CHECKED_IN: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  WAITING: 'bg-amber-100 text-amber-800 border-amber-300',
  IN_CONSULTATION: 'bg-violet-100 text-violet-800 border-violet-300',
  COMPLETED: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  CANCELLED: 'bg-red-100 text-red-800 border-red-300',
  RESCHEDULED: 'bg-cyan-100 text-cyan-800 border-cyan-300',
  NO_SHOW: 'bg-orange-100 text-orange-800 border-orange-300',
  EXPIRED: 'bg-slate-100 text-slate-600 border-slate-300',
  // queue
  CALLED: 'bg-blue-100 text-blue-800 border-blue-300',
  SKIPPED: 'bg-orange-100 text-orange-800 border-orange-300',
  // slots
  AVAILABLE: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  BLOCKED: 'bg-slate-100 text-slate-500 border-slate-300',
};

const labels: Record<string, string> = {
  HELD: 'On hold',
  BOOKED: 'Booked',
  CONFIRMED: 'Confirmed',
  CHECKED_IN: 'Checked in',
  WAITING: 'Waiting',
  IN_CONSULTATION: 'With doctor',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  RESCHEDULED: 'Rescheduled',
  NO_SHOW: 'No-show',
  EXPIRED: 'Expired',
  CALLED: 'Called',
  SKIPPED: 'Skipped',
  AVAILABLE: 'Available',
  BLOCKED: 'Blocked',
};

export function StatusBadge({ status }: { status: AppointmentStatus | QueueStatus | string }) {
  const cls = styles[status] || 'bg-slate-100 text-slate-700 border-slate-300';
  const label = labels[status] || status.replace(/_/g, ' ');
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}
    >
      {label}
    </span>
  );
}
