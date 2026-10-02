import { DoctorSummary } from '../api/types';
import { formatINR, initials } from '../utils/format';

export function DoctorCard({
  doctor,
  onSelect,
}: {
  doctor: DoctorSummary;
  onSelect?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:shadow focus:outline-none focus:ring-2 focus:ring-brand-500"
    >
      {doctor.photoUrl ? (
        <img src={doctor.photoUrl} alt={doctor.name} className="h-16 w-16 shrink-0 rounded-full object-cover" />
      ) : (
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xl font-bold text-brand-700" aria-hidden>
          {initials(doctor.name)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-bold text-slate-900">{doctor.name}</p>
        <p className="truncate text-sm text-slate-500">{doctor.specialty}</p>
        <p className="mt-1 text-sm font-semibold text-slate-800">{formatINR(doctor.consultationFee)}</p>
      </div>
      <div className="shrink-0 text-right">
        {doctor.nextAvailableSlot ? (
          <p className="text-xs font-medium text-emerald-700">Available {doctor.nextAvailableSlot}</p>
        ) : (
          <p className="text-xs text-slate-400">Check availability</p>
        )}
        <p className="mt-1 text-brand-600" aria-hidden>
          ›
        </p>
      </div>
    </button>
  );
}
