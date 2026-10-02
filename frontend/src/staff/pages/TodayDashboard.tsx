import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { ApiError } from '../../api/types';
import type { ReceptionAppointment, Slot } from '../../api/types';
import { useToast } from '../../components/Toast';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { StatusBadge } from '../../components/StatusBadge';
import { EmptyState } from '../../components/EmptyState';
import { LoadingState } from '../../components/LoadingState';
import { dayLabel, formatTime, toISODate } from '../../utils/format';

const ACTIVE_STATUSES = new Set(['BOOKED', 'CONFIRMED', 'CHECKED_IN', 'WAITING']);

function isActionable(status: string): boolean {
  return ACTIVE_STATUSES.has(status);
}

function isCheckInable(status: string): boolean {
  return status === 'BOOKED' || status === 'CONFIRMED';
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}

function RescheduleModal({
  appt,
  onClose,
  onDone,
}: {
  appt: ReceptionAppointment;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [date, setDate] = useState(toISODate(new Date()));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.doctors
      .availability(appt.doctorId, date, appt.serviceId)
      .then((res) => {
        if (!cancelled) setSlots(res.slots);
      })
      .catch((err: unknown) => {
        if (!cancelled) toast.error(err instanceof ApiError ? err.message : 'Could not load slots.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [appt.doctorId, appt.serviceId, date, toast]);

  async function pickSlot(slot: Slot) {
    setSaving(true);
    try {
      await api.reception.reschedule(appt.id, slot.startAt);
      toast.success('Appointment rescheduled.');
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SLOT_UNAVAILABLE') {
        toast.error('That slot was just taken. Please pick another slot.');
      } else {
        toast.error(err instanceof ApiError ? err.message : 'Could not reschedule.');
      }
    } finally {
      setSaving(false);
    }
  }

  const available = slots.filter((s) => s.status === 'AVAILABLE');

  return (
    <Modal open onClose={onClose} title={`Reschedule — ${appt.patient.fullName}`} wide>
      <Input label="New date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      {loading ? (
        <LoadingState message="Loading slots…" />
      ) : available.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No available slots on this date.</p>
      ) : (
        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {available.map((s) => (
            <Button key={s.startAt} variant="secondary" size="sm" disabled={saving} onClick={() => pickSlot(s)}>
              {formatTime(s.startAt)}
            </Button>
          ))}
        </div>
      )}
    </Modal>
  );
}

function CancelModal({
  appt,
  onClose,
  onDone,
}: {
  appt: ReceptionAppointment;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  async function confirm() {
    setSaving(true);
    try {
      await api.reception.cancel(appt.id, reason.trim() || undefined);
      toast.success('Appointment cancelled.');
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not cancel.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Cancel — ${appt.patient.fullName}`}>
      <Input
        label="Reason (optional)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="e.g. patient requested"
      />
      <div className="mt-4 flex gap-2">
        <Button variant="secondary" className="flex-1" onClick={onClose}>
          Keep
        </Button>
        <Button variant="danger" className="flex-1" loading={saving} onClick={confirm}>
          Cancel appointment
        </Button>
      </div>
    </Modal>
  );
}

export function TodayDashboard() {
  const toast = useToast();
  const [dateStr, setDateStr] = useState(toISODate(new Date()));
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [stats, setStats] = useState({ total: 0, checkedIn: 0, waiting: 0, completed: 0, noShow: 0 });
  const [appointments, setAppointments] = useState<ReceptionAppointment[]>([]);
  const [reschedAppt, setReschedAppt] = useState<ReceptionAppointment | null>(null);
  const [cancelAppt, setCancelAppt] = useState<ReceptionAppointment | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.reception
      .today(dateStr)
      .then((res) => {
        if (cancelled) return;
        setStats(res.stats);
        setAppointments(res.appointments);
      })
      .catch((err: unknown) => {
        if (!cancelled) toast.error(err instanceof ApiError ? err.message : 'Could not load appointments.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dateStr, reload, toast]);

  const grouped = useMemo(() => {
    const map = new Map<string, ReceptionAppointment[]>();
    for (const a of appointments) {
      const key = `${a.doctor.id}|||${a.doctor.name}|||${a.doctor.specialty}`;
      const list = map.get(key) || [];
      list.push(a);
      map.set(key, list);
    }
    return [...map.entries()].map(([key, list]) => {
      const [, name, specialty] = key.split('|||');
      return { name, specialty, list: list.sort((x, y) => x.startAt.localeCompare(y.startAt)) };
    });
  }, [appointments]);

  function shift(days: number) {
    const d = new Date(`${dateStr}T00:00:00`);
    d.setDate(d.getDate() + days);
    setDateStr(toISODate(d));
  }

  async function checkIn(appt: ReceptionAppointment) {
    setActing(appt.id);
    try {
      const res = await api.reception.checkIn(appt.id);
      toast.success(`Checked in — token #${res.queueTicket.tokenNumber}.`);
      setReload((r) => r + 1);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not check in.');
    } finally {
      setActing(null);
    }
  }

  async function noShow(appt: ReceptionAppointment) {
    if (!window.confirm(`Mark ${appt.patient.fullName} as no-show?`)) return;
    setActing(appt.id);
    try {
      await api.reception.noShow(appt.id);
      toast.success('Marked as no-show.');
      setReload((r) => r + 1);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not mark no-show.');
    } finally {
      setActing(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Appointments — {dayLabel(dateStr)}</h1>
          <div className="mt-2 flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => shift(-1)}>
              ← Prev
            </Button>
            <Input
              label=""
              aria-label="Pick date"
              type="date"
              value={dateStr}
              onChange={(e) => e.target.value && setDateStr(e.target.value)}
              className="w-44"
            />
            <Button variant="secondary" size="sm" onClick={() => shift(1)}>
              Next →
            </Button>
          </div>
        </div>
        <div className="flex gap-2">
          <Link to="/staff/walk-ins/new">
            <Button variant="secondary">+ Walk-in</Button>
          </Link>
          <Link to="/staff/appointments/new">
            <Button>+ Book Appointment</Button>
          </Link>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="Total" value={stats.total} tone="text-slate-900" />
        <StatCard label="Checked in" value={stats.checkedIn} tone="text-indigo-600" />
        <StatCard label="Waiting" value={stats.waiting} tone="text-amber-600" />
        <StatCard label="Completed" value={stats.completed} tone="text-emerald-600" />
        <StatCard label="No-show" value={stats.noShow} tone="text-orange-600" />
      </div>

      <div className="mt-6">
        {loading ? (
          <LoadingState message="Loading appointments…" />
        ) : appointments.length === 0 ? (
          <EmptyState
            title="No appointments today."
            message="Book an appointment or add a walk-in to get started."
          />
        ) : (
          grouped.map((g) => (
            <section key={g.name} className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <header className="border-b border-slate-100 bg-slate-50 px-4 py-3">
                <h2 className="text-base font-bold text-slate-900">
                  {g.name} <span className="font-normal text-slate-500">· {g.specialty}</span>
                </h2>
              </header>
              <ul className="divide-y divide-slate-100">
                {g.list.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
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
                    <StatusBadge status={a.queueStatus ?? a.status} />
                    <div className="flex flex-wrap gap-1.5">
                      {isCheckInable(a.status) && (
                        <Button
                          size="sm"
                          variant="success"
                          disabled={acting === a.id}
                          onClick={() => checkIn(a)}
                        >
                          Check in
                        </Button>
                      )}
                      {isActionable(a.status) && (
                        <>
                          <Button size="sm" variant="secondary" onClick={() => setReschedAppt(a)}>
                            Reschedule
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={acting === a.id}
                            onClick={() => noShow(a)}
                          >
                            No-show
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setCancelAppt(a)}>
                            Cancel
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      {reschedAppt && (
        <RescheduleModal
          appt={reschedAppt}
          onClose={() => setReschedAppt(null)}
          onDone={() => {
            setReschedAppt(null);
            setReload((r) => r + 1);
          }}
        />
      )}
      {cancelAppt && (
        <CancelModal
          appt={cancelAppt}
          onClose={() => setCancelAppt(null)}
          onDone={() => {
            setCancelAppt(null);
            setReload((r) => r + 1);
          }}
        />
      )}
    </div>
  );
}
