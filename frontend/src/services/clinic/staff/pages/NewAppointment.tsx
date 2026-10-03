import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../../../api/client';
import { ApiError } from '../../../../api/types';
import type { DoctorSummary, Service, Slot } from '../../../../api/types';
import { useToast } from '../../../../components/Toast';
import { Button } from '../../../../components/Button';
import { Input } from '../../../../components/Input';
import { Select } from '../../../../components/Select';
import { LoadingState } from '../../../../components/LoadingState';
import { formatTime, isValidIndianPhone, normalizePhone, toISODate } from '../../../../utils/format';

import { CLINIC_ID } from '../../../../utils/clinic';

type PatientMatch = { id: string; fullName: string; phoneMasked: string; lastVisit?: string };

export function NewAppointment() {
  const toast = useToast();
  const navigate = useNavigate();

  const [phone, setPhone] = useState('');
  const [matches, setMatches] = useState<PatientMatch[]>([]);
  const [patientId, setPatientId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [dateStr, setDateStr] = useState(toISODate(new Date()));
  const [slotStart, setSlotStart] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('PAY_AT_CLINIC');
  const [bookingSource, setBookingSource] = useState('PHONE');
  const [notes, setNotes] = useState('');

  const [doctors, setDoctors] = useState<DoctorSummary[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingRefs, setLoadingRefs] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Load doctors + services once.
  useEffect(() => {
    let cancelled = false;
    Promise.all([api.clinic.doctors(CLINIC_ID), api.clinic.services(CLINIC_ID)])
      .then(([d, s]) => {
        if (cancelled) return;
        setDoctors(d.doctors);
        setServices(s.services);
      })
      .catch((err: unknown) => {
        if (!cancelled) toast.error(err instanceof ApiError ? err.message : 'Could not load clinic data.');
      })
      .finally(() => {
        if (!cancelled) setLoadingRefs(false);
      });
    return () => {
      cancelled = true;
    };
  }, [toast]);

  // Debounced patient search by phone (500ms).
  useEffect(() => {
    const digits = normalizePhone(phone);
    if (digits.length < 4 || patientId) {
      setMatches([]);
      return;
    }
    const t = window.setTimeout(() => {
      api.reception
        .patientsSearch(digits)
        .then((res) => setMatches(res.patients))
        .catch(() => setMatches([]));
    }, 500);
    return () => window.clearTimeout(t);
  }, [phone, patientId]);

  // Load available slots when doctor/date/service change.
  useEffect(() => {
    if (!doctorId || !dateStr) {
      setSlots([]);
      setSlotStart('');
      return;
    }
    let cancelled = false;
    api.doctors
      .availability(doctorId, dateStr, serviceId || undefined)
      .then((res) => {
        if (cancelled) return;
        const avail = res.slots.filter((s) => s.status === 'AVAILABLE');
        setSlots(avail);
        if (!avail.some((s) => s.startAt === slotStart)) setSlotStart('');
      })
      .catch(() => {
        if (!cancelled) setSlots([]);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctorId, dateStr, serviceId]);

  function pickMatch(m: PatientMatch) {
    setPatientId(m.id);
    setName(m.fullName);
    setMatches([]);
  }

  function onPhoneChange(d: string) {
    setPhone(d.replace(/\D/g, '').slice(0, 10));
    setPatientId(null);
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!isValidIndianPhone(phone)) e.phone = 'Enter a valid 10-digit mobile number.';
    if (!patientId && !name.trim()) e.name = 'Patient name is required.';
    if (!doctorId) e.doctor = 'Choose a doctor.';
    if (!dateStr) e.date = 'Choose a date.';
    if (!slotStart) e.slot = 'Choose a time slot.';
    if (!serviceId) e.service = 'Choose a service.';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      await api.reception.createAppointment({
        ...(patientId
          ? { patientId }
          : { newPatient: { fullName: name.trim(), phone: normalizePhone(phone) } }),
        doctorId,
        serviceId,
        startAt: slotStart,
        bookingSource: bookingSource as 'PHONE' | 'RECEPTION',
        paymentStatus: paymentStatus as 'PAY_AT_CLINIC' | 'PENDING' | 'PAID' | 'NOT_REQUIRED',
        notesForClinic: notes.trim() || undefined,
      });
      toast.success('Appointment booked.');
      navigate('/admin/today');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SLOT_UNAVAILABLE') {
        toast.error('That slot was just taken. Please pick another slot.');
      } else {
        toast.error(err instanceof ApiError ? err.message : 'Could not book the appointment.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingRefs) return <LoadingState message="Loading…" />;

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <h1 className="text-2xl font-bold text-slate-900">Book appointment</h1>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div className="relative">
          <Input
            label="Patient mobile number"
            value={phone}
            inputMode="numeric"
            maxLength={10}
            placeholder="98765 43210"
            onChange={(e) => onPhoneChange(e.target.value)}
            error={errors.phone}
          />
          {matches.length > 0 && (
            <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
              {matches.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50"
                    onClick={() => pickMatch(m)}
                  >
                    <span className="text-sm font-medium text-slate-900">{m.fullName}</span>
                    <span className="text-xs text-slate-500">{m.phoneMasked}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Input
          label="Patient name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (patientId) setPatientId(null);
          }}
          placeholder="Full name"
          error={errors.name}
        />

        <Select
          label="Doctor"
          value={doctorId}
          onChange={(e) => setDoctorId(e.target.value)}
          options={doctors.map((d) => ({
            value: d.id,
            label: `${d.name} · ${d.specialty}`,
          }))}
          error={errors.doctor}
        />

        <Input
          label="Date"
          type="date"
          value={dateStr}
          onChange={(e) => setDateStr(e.target.value)}
          error={errors.date}
        />

        <Select
          label="Time slot"
          value={slotStart}
          onChange={(e) => setSlotStart(e.target.value)}
          options={slots.map((s) => ({ value: s.startAt, label: formatTime(s.startAt) }))}
          placeholder={slots.length === 0 ? 'No slots available' : 'Select…'}
          error={errors.slot}
        />

        <Select
          label="Service"
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
          options={services.map((s) => ({
            value: s.id,
            label: `${s.name} · ${s.durationMinutes} min`,
          }))}
          error={errors.service}
        />

        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Payment"
            value={paymentStatus}
            onChange={(e) => setPaymentStatus(e.target.value)}
            options={[
              { value: 'PAY_AT_CLINIC', label: 'Pay at clinic' },
              { value: 'PENDING', label: 'Pending' },
              { value: 'PAID', label: 'Paid' },
              { value: 'NOT_REQUIRED', label: 'Not required' },
            ]}
          />
          <Select
            label="Booking source"
            value={bookingSource}
            onChange={(e) => setBookingSource(e.target.value)}
            options={[
              { value: 'PHONE', label: 'Phone' },
              { value: 'RECEPTION', label: 'Reception' },
            ]}
          />
        </div>

        <Input
          label="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes for the clinic"
        />

        <Button type="submit" size="lg" className="w-full" loading={submitting}>
          Book appointment
        </Button>
      </form>
    </div>
  );
}
