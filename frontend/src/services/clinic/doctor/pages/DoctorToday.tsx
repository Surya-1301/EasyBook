import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../../../../api/client';
import { ApiError } from '../../../../api/types';
import type { Appointment, DoctorDayStats, QueueTicket } from '../../../../api/types';
import { useToast } from '../../../../components/Toast';
import { Button } from '../../../../components/Button';
import { Modal } from '../../../../components/Modal';
import { StatusBadge } from '../../../../components/StatusBadge';
import { EmptyState } from '../../../../components/EmptyState';
import { LoadingState } from '../../../../components/LoadingState';
import { dayLabel, formatTime } from '../../../../utils/format';

function StatCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}

function CompleteVisitModal({
  ticket,
  onClose,
  onDone,
}: {
  ticket: QueueTicket;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [required, setRequired] = useState<boolean | null>(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function handle(e: FormEvent) {
    e.preventDefault();
    if (required === null) {
      toast.error('Please say whether a follow-up is required.');
      return;
    }
    if (!ticket.appointmentId) {
      toast.error('No linked appointment found.');
      return;
    }
    setSaving(true);
    try {
      await api.doctor.completeVisit(ticket.id);
      await api.doctor.followUp(ticket.appointmentId, { required, notes: notes.trim() || undefined });
      toast.success('Visit completed.');
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not complete the visit.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Complete visit — ${ticket.patient.fullName}`}>
      <form onSubmit={handle} className="space-y-4">
        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">Follow-up required?</p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="lg"
              variant={required === true ? 'primary' : 'secondary'}
              className="flex-1"
              onClick={() => setRequired(true)}
            >
              Yes
            </Button>
            <Button
              type="button"
              size="lg"
              variant={required === false ? 'primary' : 'secondary'}
              className="flex-1"
              onClick={() => setRequired(false)}
            >
              No
            </Button>
          </div>
        </div>
        <div>
          <label
            htmlFor="visit-notes"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Notes (optional)
          </label>
          <textarea
            id="visit-notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Diagnosis, prescription notes…"
            className="min-h-[80px] w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        </div>
        <Button type="submit" size="lg" className="w-full" loading={saving}>
          Complete visit
        </Button>
      </form>
    </Modal>
  );
}

export function DoctorToday() {
  const toast = useToast();
  const [stats, setStats] = useState<DoctorDayStats>({ total: 0, completed: 0, waiting: 0, upcoming: 0 });
  const [date, setDate] = useState('');
  const [current, setCurrent] = useState<QueueTicket | undefined>(undefined);
  const [next, setNext] = useState<QueueTicket | undefined>(undefined);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showComplete, setShowComplete] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.doctor
      .today()
      .then((res) => {
        if (cancelled) return;
        setStats(res.stats);
        setDate(res.date);
        setCurrent(res.current);
        setNext(res.next);
        setAppointments(res.appointments);
      })
      .catch((err: unknown) => {
        if (!cancelled) toast.error(err instanceof ApiError ? err.message : 'Could not load today.');
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

  async function startVisit(ticket: QueueTicket) {
    setBusy(true);
    try {
      await api.doctor.startVisit(ticket.id);
      setReload((r) => r + 1);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not start the visit.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingState message="Loading today's visits…" />;

  const inVisit = current && current.status === 'IN_CONSULTATION';

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <h1 className="text-2xl font-bold text-slate-900">
        Today{date ? ` — ${dayLabel(date)}` : ''}
      </h1>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total" value={stats.total} tone="text-slate-900" />
        <StatCard label="Waiting" value={stats.waiting} tone="text-amber-600" />
        <StatCard label="Completed" value={stats.completed} tone="text-emerald-600" />
        <StatCard label="Upcoming" value={stats.upcoming} tone="text-sky-600" />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border-2 border-brand-200 bg-brand-50 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Current patient</p>
          {current ? (
            <>
              <p className="mt-2 text-4xl font-bold text-slate-900">#{current.tokenNumber}</p>
              <p className="mt-2 text-lg font-semibold text-slate-800">{current.patient.fullName}</p>
              <div className="mt-1">
                <StatusBadge status={current.status} />
              </div>
              <div className="mt-4">
                {inVisit ? (
                  <Button size="lg" variant="success" disabled={busy} onClick={() => setShowComplete(true)}>
                    Complete visit
                  </Button>
                ) : (
                  <Button size="lg" disabled={busy} onClick={() => startVisit(current)}>
                    Start Visit
                  </Button>
                )}
              </div>
            </>
          ) : (
            <p className="mt-3 text-lg text-slate-500">No one is with you right now.</p>
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

      <h2 className="mt-8 text-lg font-bold text-slate-900">Today&apos;s appointments</h2>
      <div className="mt-2">
        {appointments.length === 0 ? (
          <EmptyState title="No appointments today." message="Enjoy the quiet." />
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {appointments.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                <span className="w-24 shrink-0 text-sm font-semibold text-slate-900">
                  {formatTime(a.startAt)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">{a.patient.fullName}</p>
                  <p className="text-xs text-slate-500">
                    {a.tokenNumber != null ? `Token #${a.tokenNumber} · ` : ''}
                    {a.service.name}
                  </p>
                </div>
                <StatusBadge status={a.status} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {showComplete && current && (
        <CompleteVisitModal
          ticket={current}
          onClose={() => setShowComplete(false)}
          onDone={() => {
            setShowComplete(false);
            setReload((r) => r + 1);
          }}
        />
      )}
    </div>
  );
}
