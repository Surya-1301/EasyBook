import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import type { Appointment, Clinic } from '../../api/types';
import { ApiError } from '../../api/types';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { AppointmentCard } from '../../components/AppointmentCard';
import { EmptyState } from '../../components/EmptyState';
import { LoadingState } from '../../components/LoadingState';

const CLINIC_ID = (import.meta.env.VITE_CLINIC_ID as string | undefined) || 'demo-clinic';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function Home() {
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [upcoming, setUpcoming] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [clinicRes, apptRes] = await Promise.all([
          api.clinic.get(CLINIC_ID),
          api.appointments.list('upcoming'),
        ]);
        if (cancelled) return;
        setClinic(clinicRes.clinic);
        setUpcoming(apptRes.appointments);
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

  function search(e: React.FormEvent) {
    e.preventDefault();
    navigate(`/doctors${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`);
  }

  if (loading) return <LoadingState message="Loading…" />;

  const next = upcoming[0];

  return (
    <div className="space-y-5 px-4 pt-6">
      <header>
        <h1 className="text-xl font-extrabold text-slate-900">{clinic?.name ?? 'Clinic'}</h1>
        {clinic?.phone && <p className="text-sm text-slate-500">{clinic.phone}</p>}
      </header>

      <p className="text-2xl font-bold text-slate-900">
        {greeting()}
        {user?.name ? `, ${user.name.split(' ')[0]}` : ''}
      </p>

      <form onSubmit={search} className="flex gap-2">
        <div className="flex-1">
          <Input
            label="Search doctor"
            value={q}
            placeholder="Doctor name or specialty"
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Button type="submit" className="mt-[26px] shrink-0">
          Search
        </Button>
      </form>

      <Button size="lg" className="w-full" onClick={() => navigate('/doctors')}>
        Book Appointment
      </Button>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Upcoming</h2>
          {upcoming.length > 1 && (
            <button
              type="button"
              className="text-sm font-semibold text-brand-600 hover:underline"
              onClick={() => navigate('/appointments')}
            >
              View all
            </button>
          )}
        </div>
        {next ? (
          <AppointmentCard appointment={next} onView={() => navigate(`/appointments/${next.id}`)} />
        ) : (
          <EmptyState
            title="No upcoming appointments"
            message="Book a visit and it will show up here."
            action={<Button onClick={() => navigate('/doctors')}>Book Appointment</Button>}
          />
        )}
      </section>

      {clinic?.phone && (
        <div className="pb-4 text-center">
          <a
            href={`tel:${clinic.phone.replace(/\s/g, '')}`}
            className="text-sm font-semibold text-brand-600 hover:underline"
          >
            Call clinic
          </a>
        </div>
      )}
    </div>
  );
}
