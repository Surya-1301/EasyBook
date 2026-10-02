import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { ApiError } from '../../api/types';
import type { ExceptionType, RecurringSchedule, ScheduleException } from '../../api/types';
import { useToast } from '../../components/Toast';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Select } from '../../components/Select';
import { Modal } from '../../components/Modal';
import { EmptyState } from '../../components/EmptyState';
import { LoadingState } from '../../components/LoadingState';
import { formatDate, toISODate } from '../../utils/format';

// JS convention: Sunday = 0. Display order Mon..Sun.
const DAYS: { value: number; label: string }[] = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' },
];

type SessionInput = { startTime: string; endTime: string };

function AddExceptionModal({
  doctorId,
  onClose,
  onDone,
}: {
  doctorId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [date, setDate] = useState(toISODate(new Date()));
  const [type, setType] = useState<ExceptionType>('LEAVE');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const needsTimes = type === 'CUSTOM_HOURS' || type === 'EXTRA_HOURS' || type === 'BLOCK';

  async function handle(e: FormEvent) {
    e.preventDefault();
    if (!date) {
      setError('Choose a date.');
      return;
    }
    if (needsTimes && (!startTime || !endTime)) {
      setError('Start and end times are required for this type.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await api.admin.addException(doctorId, {
        date,
        type,
        startTime: needsTimes ? startTime : undefined,
        endTime: needsTimes ? endTime : undefined,
        reason: reason.trim() || undefined,
      });
      toast.success('Exception added.');
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not add the exception.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Add schedule exception">
      <form onSubmit={handle} className="space-y-4">
        <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} error={error || undefined} />
        <Select
          label="Type"
          value={type}
          onChange={(e) => setType(e.target.value as ExceptionType)}
          options={[
            { value: 'LEAVE', label: 'Leave (day off)' },
            { value: 'BLOCK', label: 'Block time' },
            { value: 'CUSTOM_HOURS', label: 'Custom hours' },
            { value: 'EXTRA_HOURS', label: 'Extra hours' },
          ]}
        />
        {needsTimes && (
          <div className="grid grid-cols-2 gap-4">
            <Input label="Start time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            <Input label="End time" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        )}
        <Input label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <Button type="submit" className="w-full" loading={saving}>
          Add exception
        </Button>
      </form>
    </Modal>
  );
}

export function DoctorSchedule() {
  const { id: paramId } = useParams();
  const toast = useToast();
  const [sessions, setSessions] = useState<Record<number, SessionInput[]>>({});
  const [exceptions, setExceptions] = useState<ScheduleException[]>([]);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [showException, setShowException] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (!paramId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api.admin
      .schedule(paramId)
      .then((res) => {
        if (cancelled) return;
        const byDay: Record<number, SessionInput[]> = {};
        for (const s of res.recurring) {
          const list = byDay[s.dayOfWeek] || [];
          list.push({ startTime: s.startTime, endTime: s.endTime });
          byDay[s.dayOfWeek] = list;
        }
        setSessions(byDay);
        setExceptions(res.exceptions);
      })
      .catch((err: unknown) => {
        if (!cancelled) toast.error(err instanceof ApiError ? err.message : 'Could not load the schedule.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [paramId, reload, toast]);

  if (!paramId) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <EmptyState title="No doctor selected." message="Pick a doctor from the doctors list first." />
      </div>
    );
  }

  const doctorId = paramId;

  function updateSession(day: number, idx: number, patch: Partial<SessionInput>) {
    setSessions((prev) => ({
      ...prev,
      [day]: (prev[day] || []).map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    }));
  }

  function addSession(day: number) {
    setSessions((prev) => ({
      ...prev,
      [day]: [...(prev[day] || []), { startTime: '', endTime: '' }],
    }));
  }

  function removeSession(day: number, idx: number) {
    setSessions((prev) => ({
      ...prev,
      [day]: (prev[day] || []).filter((_, i) => i !== idx),
    }));
  }

  async function saveSchedule() {
    const flat: RecurringSchedule[] = [];
    for (const d of DAYS) {
      for (const s of sessions[d.value] || []) {
        if (!s.startTime || !s.endTime) {
          toast.error('Fill in start and end times for every session, or remove empty rows.');
          return;
        }
        flat.push({ dayOfWeek: d.value, startTime: s.startTime, endTime: s.endTime });
      }
    }
    setSaving(true);
    try {
      await api.admin.saveSchedule(doctorId, flat);
      toast.success('Schedule saved.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save the schedule.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteException(excId: string) {
    if (!window.confirm('Delete this exception?')) return;
    setDeleting(excId);
    try {
      await api.admin.deleteException(doctorId, excId);
      toast.success('Exception deleted.');
      setReload((r) => r + 1);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not delete the exception.');
    } finally {
      setDeleting(null);
    }
  }

  if (loading) return <LoadingState message="Loading schedule…" />;

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Weekly schedule</h1>
        <Link to="/staff/doctors">
          <Button variant="secondary">← Doctors</Button>
        </Link>
      </div>

      <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="divide-y divide-slate-100">
          {DAYS.map((d) => {
            const list = sessions[d.value] || [];
            return (
              <div key={d.value} className="px-4 py-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900">{d.label}</h3>
                  <Button size="sm" variant="secondary" onClick={() => addSession(d.value)}>
                    + Add session
                  </Button>
                </div>
                {list.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-400">No sessions — clinic closed this day.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {list.map((s, i) => (
                      <div key={i} className="flex items-end gap-2">
                        <Input
                          label={`Start ${i + 1}`}
                          type="time"
                          value={s.startTime}
                          onChange={(e) => updateSession(d.value, i, { startTime: e.target.value })}
                          className="flex-1"
                        />
                        <Input
                          label={`End ${i + 1}`}
                          type="time"
                          value={s.endTime}
                          onChange={(e) => updateSession(d.value, i, { endTime: e.target.value })}
                          className="flex-1"
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label="Remove session"
                          onClick={() => removeSession(d.value, i)}
                        >
                          ✕
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
      <div className="mt-4">
        <Button size="lg" loading={saving} onClick={saveSchedule}>
          Save schedule
        </Button>
      </div>

      <div className="mt-8 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-slate-900">Exceptions</h2>
        <Button variant="secondary" onClick={() => setShowException(true)}>
          + Add exception
        </Button>
      </div>
      <div className="mt-3">
        {exceptions.length === 0 ? (
          <EmptyState title="No exceptions." message="Add a leave, block, or custom hours when needed." />
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {exceptions.map((ex) => (
              <li key={ex.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">
                    {formatDate(ex.date)} · {ex.type.replace(/_/g, ' ')}
                    {ex.startTime && ex.endTime ? ` · ${ex.startTime}–${ex.endTime}` : ''}
                  </p>
                  {ex.reason && <p className="truncate text-xs text-slate-500">{ex.reason}</p>}
                </div>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={deleting === ex.id}
                  onClick={() => deleteException(ex.id)}
                >
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showException && (
        <AddExceptionModal
          doctorId={doctorId}
          onClose={() => setShowException(false)}
          onDone={() => {
            setShowException(false);
            setReload((r) => r + 1);
          }}
        />
      )}
    </div>
  );
}
