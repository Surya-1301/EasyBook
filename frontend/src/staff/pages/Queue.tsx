import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { ApiError } from '../../api/types';
import type { DoctorSummary, QueueTicket } from '../../api/types';
import { useToast } from '../../components/Toast';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Select } from '../../components/Select';
import { StatusBadge } from '../../components/StatusBadge';
import { EmptyState } from '../../components/EmptyState';
import { LoadingState } from '../../components/LoadingState';
import { formatTime, toISODate } from '../../utils/format';

const CLINIC_ID = (import.meta.env.VITE_CLINIC_ID as string | undefined) || 'demo-clinic';

function TicketCard({
  title,
  ticket,
  onAction,
  busy,
}: {
  title: string;
  ticket: QueueTicket;
  onAction: (action: 'call' | 'start' | 'complete', ticket: QueueTicket) => void;
  busy: boolean;
}) {
  return (
    <div className="rounded-2xl border-2 border-brand-200 bg-brand-50 p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">{title}</p>
      <p className="mt-2 text-5xl font-bold text-slate-900">#{ticket.tokenNumber}</p>
      <p className="mt-2 text-lg font-semibold text-slate-800">{ticket.patient.fullName}</p>
      <div className="mt-1">
        <StatusBadge status={ticket.status} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => onAction('call', ticket)}>
          Call
        </Button>
        <Button size="sm" disabled={busy} onClick={() => onAction('start', ticket)}>
          Start
        </Button>
        <Button size="sm" variant="success" disabled={busy} onClick={() => onAction('complete', ticket)}>
          Complete
        </Button>
      </div>
    </div>
  );
}

export function Queue() {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const doctorId = searchParams.get('doctorId') || '';

  const [doctors, setDoctors] = useState<DoctorSummary[]>([]);
  const [queue, setQueue] = useState<QueueTicket[]>([]);
  const [currentlyServing, setCurrentlyServing] = useState<QueueTicket | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [delayMin, setDelayMin] = useState('');
  const [applyingDelay, setApplyingDelay] = useState(false);

  // Load doctors; default to the first when none selected.
  useEffect(() => {
    let cancelled = false;
    api.clinic
      .doctors(CLINIC_ID)
      .then((res) => {
        if (cancelled) return;
        setDoctors(res.doctors);
        if (!searchParams.get('doctorId') && res.doctors.length > 0) {
          setSearchParams({ doctorId: res.doctors[0].id }, { replace: true });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) toast.error(err instanceof ApiError ? err.message : 'Could not load doctors.');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load queue + poll every 20s.
  useEffect(() => {
    if (!doctorId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api.queue
      .list(doctorId, toISODate(new Date()))
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
  }, [doctorId, reload, toast]);

  useEffect(() => {
    const t = window.setInterval(() => setReload((r) => r + 1), 20000);
    return () => window.clearInterval(t);
  }, []);

  async function act(action: 'call' | 'recall' | 'skip' | 'start' | 'complete', ticket: QueueTicket) {
    setBusy(true);
    try {
      await api.queue[action](ticket.id);
      setReload((r) => r + 1);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  }

  async function applyDelay() {
    const mins = parseInt(delayMin, 10);
    if (!doctorId || Number.isNaN(mins) || mins < 0) {
      toast.error('Enter a valid number of minutes.');
      return;
    }
    setApplyingDelay(true);
    try {
      await api.reception.setDelay(doctorId, mins);
      toast.success(`Doctor delayed by ${mins} minutes.`);
      setDelayMin('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not set the delay.');
    } finally {
      setApplyingDelay(false);
    }
  }

  const waiting = queue.filter((t) => t.status === 'WAITING' || t.status === 'CALLED');
  const next = waiting[0];

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Live queue</h1>
        <Select
          label=""
          aria-label="Choose doctor"
          value={doctorId}
          onChange={(e) => setSearchParams(e.target.value ? { doctorId: e.target.value } : {})}
          options={doctors.map((d) => ({
            value: d.id,
            label: `${d.name} · ${d.specialty}`,
          }))}
          placeholder="Select doctor…"
          className="w-64"
        />
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-2 rounded-2xl border border-slate-200 bg-white p-4">
        <Input
          label="Delay by (minutes)"
          type="number"
          min={0}
          value={delayMin}
          onChange={(e) => setDelayMin(e.target.value)}
          placeholder="e.g. 15"
          className="w-48"
        />
        <Button variant="secondary" onClick={applyDelay} loading={applyingDelay} disabled={!doctorId}>
          Apply
        </Button>
      </div>

      {loading ? (
        <LoadingState message="Loading queue…" />
      ) : !doctorId ? (
        <EmptyState title="Choose a doctor to view the queue." />
      ) : (
        <>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {currentlyServing ? (
              <TicketCard title="Currently serving" ticket={currentlyServing} onAction={act} busy={busy} />
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Currently serving</p>
                <p className="mt-3 text-lg text-slate-500">Nobody is being seen right now.</p>
              </div>
            )}
            {next ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Next</p>
                <p className="mt-2 text-4xl font-bold text-slate-900">#{next.tokenNumber}</p>
                <p className="mt-2 text-lg font-semibold text-slate-800">{next.patient.fullName}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => act('call', next)}>
                    Call
                  </Button>
                  <Button size="sm" disabled={busy} onClick={() => act('start', next)}>
                    Start
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Next</p>
                <p className="mt-3 text-lg text-slate-500">No one is up next.</p>
              </div>
            )}
          </div>

          <h2 className="mt-6 text-lg font-bold text-slate-900">Waiting</h2>
          {waiting.length === 0 ? (
            <div className="mt-2">
              <EmptyState title="No patients are currently waiting." />
            </div>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
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
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => act('call', t)}>
                      Call
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => act('recall', t)}>
                      Recall
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => act('skip', t)}>
                      Skip
                    </Button>
                    <Button size="sm" disabled={busy} onClick={() => act('start', t)}>
                      Start
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
