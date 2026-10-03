import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../../../api/client';
import type { Appointment } from '../../../../api/types';
import { ApiError } from '../../../../api/types';
import { useToast } from '../../../../components/Toast';
import { AppointmentCard } from '../../../../components/AppointmentCard';
import { EmptyState } from '../../../../components/EmptyState';
import { LoadingState } from '../../../../components/LoadingState';
import { Button } from '../../../../components/Button';

type Tab = 'upcoming' | 'past' | 'cancelled';

const TABS: { id: Tab; label: string }[] = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'past', label: 'Past' },
  { id: 'cancelled', label: 'Cancelled' },
];

const EMPTY_TITLES: Record<Tab, string> = {
  upcoming: 'No upcoming appointments.',
  past: 'No past appointments.',
  cancelled: 'No cancelled appointments.',
};

export function Appointments() {
  const navigate = useNavigate();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('upcoming');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await api.appointments.list(tab);
        if (!cancelled) setAppointments(res.appointments);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof ApiError ? err.message : 'Could not load appointments.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, toast]);

  return (
    <div className="space-y-4 px-4 pt-6">
      <h1 className="text-xl font-extrabold text-slate-900">My appointments</h1>

      <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Appointment filters">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`min-h-[40px] rounded-lg text-sm font-semibold transition ${
              tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <LoadingState message="Loading appointments…" />
      ) : appointments.length === 0 ? (
        <EmptyState
          title={EMPTY_TITLES[tab]}
          action={
            tab === 'upcoming' ? (
              <Button onClick={() => navigate('/doctors')}>Book Appointment</Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {appointments.map((a) => (
            <AppointmentCard key={a.id} appointment={a} onView={() => navigate(`/appointments/${a.id}`)} />
          ))}
        </div>
      )}
    </div>
  );
}
