import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { ApiError } from '../../api/types';
import type { QueueTicket } from '../../api/types';
import { useToast } from '../../components/Toast';
import { Button } from '../../components/Button';
import { StatusBadge } from '../../components/StatusBadge';
import { EmptyState } from '../../components/EmptyState';
import { LoadingState } from '../../components/LoadingState';
import { formatTime } from '../../utils/format';

export function DoctorQueue() {
  const toast = useToast();
  const [queue, setQueue] = useState<QueueTicket[]>([]);
  const [currentlyServing, setCurrentlyServing] = useState<QueueTicket | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.doctor
      .queue()
      .then((res) => {
        if (cancelled) return;
        setQueue(res.queue);
        setCurrentlyServing(res.currentlyServing);
      })
      .catch((err: unknown) => {
        if (!cancelled) toast.error(err instanceof ApiError ? err.message : 'Could not load the queue.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reload, toast]);

  useEffect(() => {
    const t = window.setInterval(() => setReload((r) => r + 1), 20000);
    return () => window.clearInterval(t);
  }, []);

  async function act(action: 'call' | 'start' | 'complete', ticket: QueueTicket) {
    setBusyId(ticket.id);
    try {
      await api.queue[action](ticket.id);
      setReload((r) => r + 1);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Action failed.');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <LoadingState message="Loading queue…" />;

  const waiting = queue.filter((t) => t.status === 'WAITING' || t.status === 'CALLED');
  const next = waiting[0];

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <h1 className="text-2xl font-bold text-slate-900">Queue</h1>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border-2 border-brand-200 bg-brand-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Currently serving</p>
          {currentlyServing ? (
            <>
              <p className="mt-2 text-5xl font-bold text-slate-900">#{currentlyServing.tokenNumber}</p>
              <p className="mt-2 text-lg font-semibold text-slate-800">{currentlyServing.patient.fullName}</p>
              <div className="mt-1">
                <StatusBadge status={currentlyServing.status} />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busyId === currentlyServing.id}
                  onClick={() => act('call', currentlyServing)}
                >
                  Call
                </Button>
                <Button size="sm" disabled={busyId === currentlyServing.id} onClick={() => act('start', currentlyServing)}>
                  Start
                </Button>
                <Button
                  size="sm"
                  variant="success"
                  disabled={busyId === currentlyServing.id}
                  onClick={() => act('complete', currentlyServing)}
                >
                  Complete
                </Button>
              </div>
            </>
          ) : (
            <p className="mt-3 text-lg text-slate-500">Nobody is being seen right now.</p>
          )}
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Next</p>
          {next ? (
            <>
              <p className="mt-2 text-4xl font-bold text-slate-900">#{next.tokenNumber}</p>
              <p className="mt-2 text-lg font-semibold text-slate-800">{next.patient.fullName}</p>
            </>
          ) : (
            <p className="mt-3 text-lg text-slate-500">No one is up next.</p>
          )}
        </div>
      </div>

      <h2 className="mt-8 text-lg font-bold text-slate-900">Waiting</h2>
      <div className="mt-2">
        {waiting.length === 0 ? (
          <EmptyState title="No patients are currently waiting." />
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {waiting.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="w-16 shrink-0 text-lg font-bold text-slate-900">#{t.tokenNumber}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{t.patient.fullName}</p>
                  <p className="text-xs text-slate-500">
                    {t.appointmentTime ? `Appointment ${formatTime(t.appointmentTime)} · ` : ''}
                    {t.estimatedWaitMinutes} min wait
                  </p>
                </div>
                <StatusBadge status={t.status} />
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="secondary" disabled={busyId === t.id} onClick={() => act('call', t)}>
                    Call
                  </Button>
                  <Button size="sm" disabled={busyId === t.id} onClick={() => act('start', t)}>
                    Start
                  </Button>
                  <Button size="sm" variant="success" disabled={busyId === t.id} onClick={() => act('complete', t)}>
                    Complete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
