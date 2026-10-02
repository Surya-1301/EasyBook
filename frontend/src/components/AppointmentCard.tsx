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
      <p className="mt-2 text-sm text-slate-700">{formatDateTime(appointment.startAt)}</p>
      <p className="text-sm text-slate-500">
        For {appointment.patient.fullName}
        {appointment.tokenNumber != null && ` • Token #${appointment.tokenNumber}`}
      </p>
    </button>
  );
}
