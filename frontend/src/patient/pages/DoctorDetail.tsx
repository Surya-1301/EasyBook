import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { Doctor, Service, Slot } from '../../api/types';
import { ApiError } from '../../api/types';
import { useToast } from '../../components/Toast';
import { Select } from '../../components/Select';
import { LoadingState } from '../../components/LoadingState';
import { EmptyState } from '../../components/EmptyState';
import { Button } from '../../components/Button';
import { dayLabel, formatINR, formatTime, initials, nextDays } from '../../utils/format';

const CLINIC_ID = (import.meta.env.VITE_CLINIC_ID as string | undefined) || 'demo-clinic';

export function DoctorDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [clinicPhone, setClinicPhone] = useState<string | undefined>(undefined);
  const [serviceId, setServiceId] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  const dates = useMemo(() => nextDays(12), []);
  const [date, setDate] = useState(dates[0]);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [doctorRes, servicesRes, clinicRes] = await Promise.all([
          api.doctors.get(id),
          api.clinic.services(CLINIC_ID),
          api.clinic.get(CLINIC_ID),
        ]);
        if (cancelled) return;
        setDoctor(doctorRes.doctor);
        setServices(servicesRes.services);
        setClinicPhone(clinicRes.clinic.phone);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof ApiError ? err.message : 'Could not load the doctor.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, toast]);

  useEffect(() => {
    if (!id || !serviceId || !date) {
      setSlots([]);
      return;
    }
    let cancelled = false;
    setSlotsLoading(true);
    (async () => {
      try {
        const res = await api.doctors.availability(id, date, serviceId);
        if (!cancelled) setSlots(res.slots);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof ApiError ? err.message : 'Could not load slots.');
      } finally {
        if (!cancelled) setSlotsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, serviceId, date, toast]);

  if (loading) return <LoadingState message="Loading doctor…" />;
  if (!id || !doctor) {
    return (
      <div className="px-4 pt-6">
        <EmptyState
          title="Doctor not found"
          action={<Button onClick={() => navigate('/doctors')}>Back to doctors</Button>}
        />
      </div>
    );
  }

  function pickSlot(slot: Slot) {
    navigate(
      `/booking/${id}?date=${encodeURIComponent(date)}&slot=${encodeURIComponent(slot.startAt)}&serviceId=${encodeURIComponent(serviceId)}`
    );
  }

  return (
    <div className="space-y-5 px-4 pt-6">
      <Link to="/doctors" className="text-sm font-semibold text-brand-600 hover:underline">
        ← All doctors
      </Link>

      <div className="flex items-start gap-4">
        {doctor.photoUrl ? (
          <img src={doctor.photoUrl} alt={doctor.name} className="h-20 w-20 shrink-0 rounded-full object-cover" />
        ) : (
          <div
            className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-brand-100 text-2xl font-bold text-brand-700"
            aria-hidden
          >
            {initials(doctor.name)}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold text-slate-900">{doctor.name}</h1>
          <p className="text-sm text-slate-500">{doctor.specialty}</p>
          {doctor.qualification && <p className="text-sm text-slate-500">{doctor.qualification}</p>}
          {doctor.experienceYears != null && (
            <p className="mt-1 text-sm text-slate-600">{doctor.experienceYears} years of experience</p>
          )}
          {doctor.languages && doctor.languages.length > 0 && (
            <p className="mt-1 text-sm text-slate-600">Languages: {doctor.languages.join(', ')}</p>
          )}
          <p className="mt-1 text-base font-bold text-slate-900">{formatINR(doctor.consultationFee)}</p>
        </div>
      </div>

      {doctor.bio && <p className="text-sm leading-relaxed text-slate-600">{doctor.bio}</p>}

      {clinicPhone && (
        <a
          href={`tel:${clinicPhone.replace(/\s/g, '')}`}
          className="inline-block text-sm font-semibold text-brand-600 hover:underline"
        >
          Call Clinic
        </a>
      )}

      <section className="space-y-3">
        <h2 className="text-base font-bold text-slate-900">Book a slot</h2>
        <Select
          label="Service"
          placeholder="Choose a service"
          value={serviceId}
          options={services.map((s) => ({ value: s.id, label: `${s.name} • ${formatINR(s.fee)}` }))}
          onChange={(e) => setServiceId(e.target.value)}
        />

        <div>
          <p className="mb-1 text-sm font-medium text-slate-700">Date</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {dates.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDate(d)}
                className={`min-h-[44px] shrink-0 rounded-xl border px-3 py-1.5 text-sm font-semibold ${
                  d === date
                    ? 'border-brand-600 bg-brand-600 text-white'
                    : 'border-slate-300 bg-white text-slate-700'
                }`}
              >
                {dayLabel(d)}
              </button>
            ))}
          </div>
        </div>

        {!serviceId ? (
          <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
            Choose a service above to see available slots.
          </p>
        ) : slotsLoading ? (
          <LoadingState message="Loading slots…" />
        ) : slots.length === 0 ? (
          <EmptyState title="No slots available" message="Try a different date or service." />
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {slots.map((s) => {
              const available = s.status === 'AVAILABLE';
              return (
                <button
                  key={s.startAt}
                  type="button"
                  disabled={!available}
                  onClick={() => pickSlot(s)}
                  className={`min-h-[44px] rounded-xl border px-2 py-2 text-sm font-semibold transition ${
                    available
                      ? 'border-brand-300 bg-white text-brand-700 hover:bg-brand-50'
                      : 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400 line-through'
                  }`}
                >
                  {formatTime(s.startAt)}
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
