import { useEffect, useMemo, useState } from 'react';
import type { ComponentType, SVGProps } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import type { Appointment, Clinic, DoctorSummary } from '../../api/types';
import { ApiError } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { LoadingState } from '../../components/LoadingState';
import { DoctorCard } from '../../components/DoctorCard';
import { IconCalendarPlus, IconClock, IconUsers } from '../../components/icons';
import { formatDateTime, initials } from '../../utils/format';

import { CLINIC_ID } from '../../utils/clinic';

function QuickAction({
  icon: Icon,
  label,
  sub,
  onClick,
}: {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  sub: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow focus:outline-none focus:ring-2 focus:ring-brand-500"
    >
      <span
        className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-100 text-brand-700"
        aria-hidden
      >
        <Icon className="h-6 w-6" />
      </span>
      <span className="text-sm font-bold text-slate-900">{label}</span>
      <span className="text-[11px] leading-tight text-slate-500">{sub}</span>
    </button>
  );
}

export function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [upcoming, setUpcoming] = useState<Appointment[]>([]);
  const [doctors, setDoctors] = useState<DoctorSummary[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [clinicRes, apptRes, doctorsRes] = await Promise.all([
          api.clinic.get(CLINIC_ID),
          api.appointments.list('upcoming'),
          api.clinic.doctors(CLINIC_ID),
        ]);
        if (cancelled) return;
        setClinic(clinicRes.clinic);
        setUpcoming(apptRes.appointments);
        setDoctors(doctorsRes.doctors);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof ApiError ? err.message : 'Could not load the home screen.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const nextVisit = useMemo(
    () => upcoming.find((a) => ['BOOKED', 'CONFIRMED'].includes(a.status)),
    [upcoming],
  );

  const filteredDoctors = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return doctors;
    return doctors.filter(
      (d) => d.name.toLowerCase().includes(q) || d.specialty.toLowerCase().includes(q),
    );
  }, [doctors, search]);

  async function checkIn() {
    if (!nextVisit) return;
    setCheckingIn(true);
    try {
      const res = await api.appointments.checkIn(nextVisit.id);
      toast.success(`Checked in! Your token is #${res.queueTicket.tokenNumber}`);
      navigate(`/queue/${nextVisit.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Check-in failed.');
    } finally {
      setCheckingIn(false);
    }
  }

  const firstName = (user?.name || 'there').split(' ')[0];

  if (loading) return <LoadingState message="Loading…" />;

  return (
    <div className="pb-2">
      {/* Greeting header */}
      <div className="rounded-b-[2rem] bg-gradient-to-br from-brand-600 via-brand-500 to-teal-500 px-5 pb-8 pt-6 text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-teal-50/90">Good day,</p>
            <h1 className="truncate text-2xl font-extrabold">{firstName}</h1>
            <p className="mt-0.5 truncate text-sm text-teal-50/90">{clinic?.name || 'Your clinic'}</p>
          </div>
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/20 text-lg font-bold backdrop-blur"
            aria-hidden
          >
            {initials(user?.name || firstName)}
          </div>
        </div>
        <label className="mt-4 block">
          <span className="sr-only">Search doctors</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search doctors or specialties…"
            className="w-full rounded-full border-0 bg-white/95 px-5 py-3 text-sm text-slate-900 shadow placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-white"
          />
        </label>
      </div>

      <div className="-mt-2 px-4">
        {/* Upcoming visit */}
        {nextVisit && (
          <section aria-label="Upcoming visit" className="mt-2">
            <p className="px-1 text-[11px] font-bold uppercase tracking-widest text-slate-400">
              Upcoming visit
            </p>
            <div className="mt-2 overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
              <div className="flex items-center gap-3 bg-brand-50 px-5 py-4">
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-600 text-base font-bold text-white"
                  aria-hidden
                >
                  {initials(nextVisit.doctor.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-base font-extrabold text-slate-900">
                    {nextVisit.doctor.name}
                  </p>
                  <p className="truncate text-sm text-slate-500">{nextVisit.doctor.specialty}</p>
                </div>
                {nextVisit.tokenNumber != null && (
                  <span className="shrink-0 rounded-full bg-brand-600 px-3 py-1 text-sm font-bold text-white">
                    #{nextVisit.tokenNumber}
                  </span>
                )}
              </div>
              <div className="px-5 py-4">
                <p className="text-sm font-semibold text-slate-800">
                  {formatDateTime(nextVisit.startAt)}
                </p>
                <p className="text-sm text-slate-500">For {nextVisit.patient.fullName}</p>
                <div className="mt-3 flex gap-2">
                  {nextVisit.queueTicket ? (
                    <Button className="flex-1" onClick={() => navigate(`/queue/${nextVisit.id}`)}>
                      View queue
                    </Button>
                  ) : (
                    <>
                      <Button className="flex-1" loading={checkingIn} onClick={checkIn}>
                        Check in
                      </Button>
                      <Button
                        variant="secondary"
                        className="flex-1"
                        onClick={() => navigate(`/appointments/${nextVisit.id}`)}
                      >
                        Details
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Quick actions */}
        <section aria-label="Quick actions" className="mt-6">
          <div className="grid grid-cols-3 gap-3">
            <QuickAction icon={IconCalendarPlus} label="Book visit" sub="Find a doctor" onClick={() => navigate('/doctors')} />
            <QuickAction icon={IconUsers} label="Family" sub="Members" onClick={() => navigate('/profile')} />
            <QuickAction
              icon={IconClock}
              label="My queue"
              sub="Live status"
              onClick={() =>
                nextVisit?.queueTicket ? navigate(`/queue/${nextVisit.id}`) : navigate('/appointments')
              }
            />
          </div>
        </section>

        {/* Doctors */}
        <section aria-label="Our doctors" className="mt-6">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-lg font-extrabold text-slate-900">Our doctors</h2>
            <button
              type="button"
              onClick={() => navigate('/doctors')}
              className="text-sm font-semibold text-brand-700"
            >
              View all
            </button>
          </div>
          <div className="mt-3 space-y-3">
            {filteredDoctors.length === 0 ? (
              <EmptyState
                title={search ? 'No doctors match your search.' : 'No doctors available right now.'}
              />
            ) : (
              filteredDoctors
                .slice(0, 5)
                .map((d) => (
                  <DoctorCard key={d.id} doctor={d} onSelect={() => navigate(`/doctors/${d.id}`)} />
                ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
