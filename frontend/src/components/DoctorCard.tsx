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
      className="flex w-full items-center gap-4 rounded-3xl border border-slate-100 bg-white p-4 text-left shadow-sm transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-brand-500"
    >
      {doctor.photoUrl ? (
        <img
          src={doctor.photoUrl}
          alt={doctor.name}
          className="h-14 w-14 shrink-0 rounded-2xl object-cover"
        />
      ) : (
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-lg font-bold text-white"
          aria-hidden
        >
          {initials(doctor.name)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-extrabold text-slate-900">{doctor.name}</p>
        <p className="truncate text-sm text-slate-500">{doctor.specialty}</p>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-bold text-brand-700">
            {formatINR(doctor.consultationFee)}
          </span>
          {doctor.nextAvailableSlot ? (
            <span className="text-xs font-medium text-emerald-700">
              Next: {doctor.nextAvailableSlot}
            </span>
          ) : null}
        </div>
      </div>
      <span className="shrink-0 text-2xl text-slate-300" aria-hidden>
        ›
      </span>
    </button>
  );
}
