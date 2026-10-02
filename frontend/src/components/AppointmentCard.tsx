import { Appointment } from '../api/types';
import { formatDateTime } from '../utils/format';
import { StatusBadge } from './StatusBadge';

export function AppointmentCard({
  appointment,
  onView,
}: {
  appointment: Appointment;
  onView?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onView}
      className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:shadow focus:outline-none focus:ring-2 focus:ring-brand-500"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-base font-bold text-slate-900">{appointment.doctor.name}</p>
          <p className="text-sm text-slate-500">{appointment.doctor.specialty}</p>
        </div>
        <StatusBadge status={appointment.status} />
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-sm text-slate-700">
        <span className="font-medium">{formatDateTime(appointment.startAt)}</span>
        {appointment.tokenNumber != null && (
          <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-bold text-brand-700">
            Token #{appointment.tokenNumber}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-500">For {appointment.patient.fullName}</p>
    </button>
  );
}
