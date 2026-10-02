import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { Appointment, Slot } from '../../api/types';
import { ApiError } from '../../api/types';
import { useToast } from '../../components/Toast';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { StatusBadge } from '../../components/StatusBadge';
import { Modal } from '../../components/Modal';
import { EmptyState } from '../../components/EmptyState';
import { LoadingState } from '../../components/LoadingState';
import { dayLabel, formatDateTime, formatTime, nextDays } from '../../utils/format';

import { CLINIC_ID } from '../../utils/clinic';

const PAYMENT_LABELS: Record<string, string> = {
  PENDING: 'Payment pending',
  PAID: 'Paid',
  FAILED: 'Payment failed',
  REFUNDED: 'Refunded',
  NOT_REQUIRED: 'No payment needed',
  PAY_AT_CLINIC: 'Pay at clinic',
};

const ACTIONABLE = new Set(['BOOKED', 'CONFIRMED']);

export function AppointmentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [appointment, setAppointment] = useState<Appointment | null>(null);
  const [clinicPhone, setClinicPhone] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleSlots, setRescheduleSlots] = useState<Slot[]>([]);
  const [rescheduleSlotsLoading, setRescheduleSlotsLoading] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);

  const [checkingIn, setCheckingIn] = useState(false);

  const rescheduleDates = useMemo(() => nextDays(12), []);
  const [rescheduleDate, setRescheduleDate] = useState(rescheduleDates[0]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.appointments.get(id);
      setAppointment(res.appointment);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load the appointment.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    api.clinic
      .get(CLINIC_ID)
      .then((res) => {
        if (!cancelled) setClinicPhone(res.clinic.phone);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!rescheduleOpen || !appointment) return;
    let cancelled = false;
    setRescheduleSlotsLoading(true);
    api.doctors
      .availability(appointment.doctorId, rescheduleDate, appointment.serviceId)
      .then((res) => {
        if (!cancelled) setRescheduleSlots(res.slots);
      })
      .catch((err: unknown) => {
        if (!cancelled) toast.error(err instanceof ApiError ? err.message : 'Could not load slots.');
      })
      .finally(() => {
        if (!cancelled) setRescheduleSlotsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rescheduleOpen, rescheduleDate, appointment, toast]);

  async function checkIn() {
    if (!id) return;
    setCheckingIn(true);
    try {
      const res = await api.appointments.checkIn(id);
      toast.success(`Checked in! Your token is #${res.queueTicket.tokenNumber}`);
      navigate(`/queue/${id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not check in. Please try again.');
    } finally {
      setCheckingIn(false);
    }
  }

  async function confirmCancel() {
    if (!id) return;
    setCancelling(true);
    try {
      await api.appointments.cancel(id, cancelReason.trim() || undefined);
      toast.success('Appointment cancelled');
      setCancelOpen(false);
      setCancelReason('');
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not cancel the appointment.');
    } finally {
      setCancelling(false);
    }
  }

  async function confirmReschedule(slot: Slot) {
    if (!id) return;
    setRescheduling(true);
    try {
      await api.appointments.reschedule(id, slot.startAt);
      toast.success('Appointment changed');
      setRescheduleOpen(false);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not change the appointment.');
    } finally {
      setRescheduling(false);
    }
  }

  if (loading) return <LoadingState message="Loading appointment…" />;
  if (error || !appointment) {
    return (
      <div className="px-4 pt-6">
        <EmptyState
          title="Could not load the appointment"
          message={error ?? undefined}
          action={<Button onClick={() => navigate('/appointments')}>Back to appointments</Button>}
        />
      </div>
    );
  }

  const canAct = ACTIONABLE.has(appointment.status);

  return (
    <div className="space-y-5 px-4 pt-6">
      <Link to="/appointments" className="text-sm font-semibold text-brand-600 hover:underline">
        ← All appointments
      </Link>

      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">{appointment.doctor.name}</h1>
          <p className="text-sm text-slate-500">{appointment.doctor.specialty}</p>
        </div>
        <StatusBadge status={appointment.status} />
      </div>

      <dl className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex justify-between gap-4">
          <dt className="text-sm text-slate-500">Date & time</dt>
          <dd className="text-right text-sm font-semibold text-slate-900">{formatDateTime(appointment.startAt)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-sm text-slate-500">Patient</dt>
          <dd className="text-right text-sm font-semibold text-slate-900">{appointment.patient.fullName}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-sm text-slate-500">Appointment no.</dt>
          <dd className="text-right text-sm font-semibold text-slate-900">{appointment.appointmentNumber}</dd>
        </div>
        {appointment.tokenNumber != null && (
          <div className="flex justify-between gap-4">
            <dt className="text-sm text-slate-500">Token</dt>
            <dd className="text-right text-sm font-semibold text-slate-900">#{appointment.tokenNumber}</dd>
          </div>
        )}
        <div className="flex justify-between gap-4">
          <dt className="text-sm text-slate-500">Payment</dt>
          <dd className="text-right text-sm font-semibold text-slate-900">
            {PAYMENT_LABELS[appointment.paymentStatus] ?? appointment.paymentStatus}
          </dd>
        </div>
        {appointment.cancellationReason && (
          <div className="flex justify-between gap-4">
            <dt className="text-sm text-slate-500">Cancellation reason</dt>
            <dd className="text-right text-sm font-semibold text-slate-900">{appointment.cancellationReason}</dd>
          </div>
        )}
      </dl>

      {appointment.queueTicket && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900">
              Token #{appointment.queueTicket.tokenNumber} • {appointment.queueTicket.status.toLowerCase().replace(/_/g, ' ')}
            </p>
            <Button size="sm" onClick={() => navigate(`/queue/${appointment.id}`)}>
              View live queue
            </Button>
          </div>
        </div>
      )}

      {canAct && (
        <div className="space-y-2">
          <Button size="lg" className="w-full" variant="success" loading={checkingIn} onClick={checkIn}>
            Check In
          </Button>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setRescheduleOpen(true)}>
              Change appointment
            </Button>
            <Button variant="danger" className="flex-1" onClick={() => setCancelOpen(true)}>
              Cancel appointment
            </Button>
          </div>
        </div>
      )}

      {clinicPhone && (
        <div className="pb-4 text-center">
          <a
            href={`tel:${clinicPhone.replace(/\s/g, '')}`}
            className="text-sm font-semibold text-brand-600 hover:underline"
          >
            Call clinic
          </a>
        </div>
      )}

      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel appointment">
        <p className="text-sm text-slate-600">Are you sure you want to cancel this appointment?</p>
        <div className="mt-4">
          <Input
            label="Reason (optional)"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Tell us why…"
          />
        </div>
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setCancelOpen(false)}>
            Keep it
          </Button>
          <Button variant="danger" className="flex-1" loading={cancelling} onClick={confirmCancel}>
            Cancel appointment
          </Button>
        </div>
      </Modal>

      <Modal open={rescheduleOpen} onClose={() => setRescheduleOpen(false)} title="Change appointment" wide>
        <p className="mb-2 text-sm font-medium text-slate-700">New date</p>
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {rescheduleDates.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setRescheduleDate(d)}
              className={`min-h-[44px] shrink-0 rounded-xl border px-3 py-1.5 text-sm font-semibold ${
                d === rescheduleDate
                  ? 'border-brand-600 bg-brand-600 text-white'
                  : 'border-slate-300 bg-white text-slate-700'
              }`}
            >
              {dayLabel(d)}
            </button>
          ))}
        </div>
        {rescheduleSlotsLoading ? (
          <LoadingState message="Loading slots…" />
        ) : rescheduleSlots.length === 0 ? (
          <EmptyState title="No slots available" message="Try a different date." />
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {rescheduleSlots.map((s) => {
              const available = s.status === 'AVAILABLE';
              return (
                <button
                  key={s.startAt}
                  type="button"
                  disabled={!available || rescheduling}
                  onClick={() => confirmReschedule(s)}
                  className={`min-h-[44px] rounded-xl border px-2 py-2 text-sm font-semibold ${
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
      </Modal>
    </div>
  );
}
