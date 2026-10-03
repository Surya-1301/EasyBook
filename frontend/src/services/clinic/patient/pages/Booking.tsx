import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../../../api/client';
import type { Appointment, Doctor, Patient, Service } from '../../../../api/types';
import { ApiError } from '../../../../api/types';
import { useToast } from '../../../../components/Toast';
import { Button } from '../../../../components/Button';
import { Input } from '../../../../components/Input';
import { Select } from '../../../../components/Select';
import { Modal } from '../../../../components/Modal';
import { LoadingState } from '../../../../components/LoadingState';
import { EmptyState } from '../../../../components/EmptyState';
import { formatDateTime, formatINR, isValidIndianPhone, normalizePhone } from '../../../../utils/format';

import { CLINIC_ID } from '../../../../utils/clinic';

const RELATIONSHIPS = ['Spouse', 'Child', 'Parent', 'Sibling', 'Other'];
const GENDERS = ['Male', 'Female', 'Other'];

function FamilyMemberForm({ onDone, onCancel }: { onDone: (patient: Patient) => void; onCancel: () => void }) {
  const toast = useToast();
  const [fullName, setFullName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!fullName.trim()) {
      toast.error('Enter the full name');
      return;
    }
    if (!relationship) {
      toast.error('Choose the relationship');
      return;
    }
    if (phone && !isValidIndianPhone(phone)) {
      toast.error('Enter a valid 10-digit mobile number');
      return;
    }
    setSaving(true);
    try {
      const res = await api.patients.addFamily({
        fullName: fullName.trim(),
        relationship,
        dateOfBirth: dateOfBirth || undefined,
        gender: gender || undefined,
        phone: phone ? normalizePhone(phone) : undefined,
      });
      toast.success('Family member added');
      onDone(res.patient);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not add the family member.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Input label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus />
      <Select
        label="Relationship"
        placeholder="Choose relationship"
        value={relationship}
        options={RELATIONSHIPS.map((r) => ({ value: r, label: r }))}
        onChange={(e) => setRelationship(e.target.value)}
      />
      <Input label="Date of birth" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
      <Select
        label="Gender"
        placeholder="Choose gender"
        value={gender}
        options={GENDERS.map((g) => ({ value: g, label: g }))}
        onChange={(e) => setGender(e.target.value)}
      />
      <Input
        label="Phone (optional)"
        value={phone}
        inputMode="numeric"
        maxLength={10}
        placeholder="10-digit mobile number"
        onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
      />
      <div className="flex gap-2">
        <Button type="button" variant="secondary" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" className="flex-1" loading={saving}>
          Add member
        </Button>
      </div>
    </form>
  );
}

export function Booking() {
  const { doctorId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();

  const slot = searchParams.get('slot') || '';
  const serviceId = searchParams.get('serviceId') || '';

  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [service, setService] = useState<Service | null>(null);
  const [me, setMe] = useState<Patient | null>(null);
  const [family, setFamily] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);

  const [step, setStep] = useState<'patient' | 'confirm' | 'success'>('patient');
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [notes, setNotes] = useState('');
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [appointment, setAppointment] = useState<Appointment | null>(null);

  useEffect(() => {
    if (!doctorId || !slot || !serviceId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [doctorRes, servicesRes, meRes, familyRes] = await Promise.all([
          api.doctors.get(doctorId),
          api.clinic.services(CLINIC_ID),
          api.patients.me(),
          api.patients.family(),
        ]);
        if (cancelled) return;
        setDoctor(doctorRes.doctor);
        setService(servicesRes.services.find((s) => s.id === serviceId) ?? null);
        setMe(meRes.patient);
        setFamily(familyRes.family);
        setSelectedPatientId(meRes.patient.id);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof ApiError ? err.message : 'Could not load booking details.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doctorId, slot, serviceId, toast]);

  if (loading) return <LoadingState message="Loading booking…" />;
  if (!doctorId || !slot || !serviceId || !doctor || !me) {
    return (
      <div className="px-4 pt-6">
        <EmptyState
          title="Booking details are missing"
          message="Please go back and pick a doctor and a slot."
          action={<Button onClick={() => navigate('/doctors')}>Choose doctor</Button>}
        />
      </div>
    );
  }

  const selectedPatient: Patient | null =
    me.id === selectedPatientId ? me : (family.find((f) => f.id === selectedPatientId) ?? null);

  function continueToConfirm() {
    if (!selectedPatientId) {
      toast.error('Choose who the appointment is for');
      return;
    }
    setStep('confirm');
  }

  async function confirmBooking() {
    if (!doctorId) return;
    setConfirming(true);
    try {
      const hold = await api.appointments.hold({
        doctorId,
        serviceId,
        startAt: slot,
        patientId: selectedPatientId,
      });
      const res = await api.appointments.create({
        holdId: hold.hold.id,
        notesForClinic: notes.trim() || undefined,
        idempotencyKey: crypto.randomUUID(),
      });
      setAppointment(res.appointment);
      setStep('success');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SLOT_UNAVAILABLE') {
        toast.error('That slot was just taken. Please choose another time.');
        navigate(-1);
      } else {
        toast.error(err instanceof ApiError ? err.message : 'Could not confirm your booking. Please try again.');
      }
    } finally {
      setConfirming(false);
    }
  }

  async function onMemberAdded(patient: Patient) {
    const res = await api.patients.family();
    setFamily(res.family);
    setSelectedPatientId(patient.id);
    setAddMemberOpen(false);
  }

  if (step === 'success' && appointment) {
    return (
      <div className="flex flex-col items-center px-4 pt-12 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 text-4xl text-emerald-700" aria-hidden>
          ✓
        </div>
        <h1 className="mt-4 text-2xl font-extrabold text-slate-900">Appointment confirmed</h1>
        <p className="mt-2 text-sm text-slate-500">
          Appointment number <span className="font-bold text-slate-900">{appointment.appointmentNumber}</span>
        </p>
        {appointment.tokenNumber != null && (
          <p className="mt-1 text-sm text-slate-500">
            Token <span className="font-bold text-slate-900">#{appointment.tokenNumber}</span>
          </p>
        )}
        <p className="mt-2 text-base font-semibold text-slate-800">{formatDateTime(appointment.startAt)}</p>
        <p className="text-sm text-slate-600">
          {appointment.doctor.name} • {appointment.doctor.specialty}
        </p>
        <div className="mt-8 w-full max-w-sm space-y-3">
          <Button className="w-full" size="lg" onClick={() => navigate(`/appointments/${appointment.id}`)}>
            View appointment
          </Button>
          <Button variant="secondary" className="w-full" onClick={() => navigate('/home')}>
            Back to home
          </Button>
        </div>
      </div>
    );
  }

  if (step === 'confirm' && selectedPatient) {
    return (
      <div className="space-y-5 px-4 pt-6">
        <h1 className="text-xl font-extrabold text-slate-900">Confirm booking</h1>
        <dl className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex justify-between gap-4">
            <dt className="text-sm text-slate-500">Doctor</dt>
            <dd className="text-right text-sm font-semibold text-slate-900">
              {doctor.name}
              <span className="block text-xs font-normal text-slate-500">{doctor.specialty}</span>
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-sm text-slate-500">Date & time</dt>
            <dd className="text-right text-sm font-semibold text-slate-900">{formatDateTime(slot)}</dd>
          </div>
          {service && (
            <div className="flex justify-between gap-4">
              <dt className="text-sm text-slate-500">Service</dt>
              <dd className="text-right text-sm font-semibold text-slate-900">{service.name}</dd>
            </div>
          )}
          <div className="flex justify-between gap-4">
            <dt className="text-sm text-slate-500">Patient</dt>
            <dd className="text-right text-sm font-semibold text-slate-900">{selectedPatient.fullName}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-sm text-slate-500">Fee</dt>
            <dd className="text-right text-sm font-semibold text-slate-900">
              {formatINR(service?.fee ?? doctor.consultationFee)}
            </dd>
          </div>
        </dl>

        <p className="text-sm text-slate-500">Free cancellation up to 24 hours before your appointment.</p>

        <div>
          <label htmlFor="booking-notes" className="mb-1 block text-sm font-medium text-slate-700">
            Notes for the clinic (optional)
          </label>
          <textarea
            id="booking-notes"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything the clinic should know…"
            className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setStep('patient')}>
            Back
          </Button>
          <Button className="flex-1" size="lg" loading={confirming} onClick={confirmBooking}>
            Confirm booking
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 px-4 pt-6">
      <Link to={`/doctors/${doctorId}`} className="text-sm font-semibold text-brand-600 hover:underline">
        ← Change slot
      </Link>
      <div>
        <h1 className="text-xl font-extrabold text-slate-900">Who is the appointment for?</h1>
        <p className="mt-1 text-sm text-slate-500">
          {doctor.name} • {formatDateTime(slot)}
        </p>
      </div>

      <div className="space-y-3" role="radiogroup" aria-label="Choose patient">
        <button
          type="button"
          role="radio"
          aria-checked={selectedPatientId === me.id}
          onClick={() => setSelectedPatientId(me.id)}
          className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left ${
            selectedPatientId === me.id ? 'border-brand-600 bg-brand-50' : 'border-slate-200 bg-white'
          }`}
        >
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
              selectedPatientId === me.id ? 'border-brand-600' : 'border-slate-300'
            }`}
            aria-hidden
          >
            {selectedPatientId === me.id && <span className="h-2.5 w-2.5 rounded-full bg-brand-600" />}
          </span>
          <span>
            <span className="block text-base font-bold text-slate-900">{me.fullName}</span>
            <span className="block text-sm text-slate-500">Me</span>
          </span>
        </button>

        {family.map((f) => (
          <button
            key={f.id}
            type="button"
            role="radio"
            aria-checked={selectedPatientId === f.id}
            onClick={() => setSelectedPatientId(f.id)}
            className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left ${
              selectedPatientId === f.id ? 'border-brand-600 bg-brand-50' : 'border-slate-200 bg-white'
            }`}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                selectedPatientId === f.id ? 'border-brand-600' : 'border-slate-300'
              }`}
              aria-hidden
            >
              {selectedPatientId === f.id && <span className="h-2.5 w-2.5 rounded-full bg-brand-600" />}
            </span>
            <span>
              <span className="block text-base font-bold text-slate-900">{f.fullName}</span>
              <span className="block text-sm text-slate-500">{f.relationship || 'Family member'}</span>
            </span>
          </button>
        ))}

        <button
          type="button"
          onClick={() => setAddMemberOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm font-semibold text-brand-600"
        >
          + Add family member
        </button>
      </div>

      <Button size="lg" className="w-full" onClick={continueToConfirm}>
        Continue
      </Button>

      <Modal open={addMemberOpen} onClose={() => setAddMemberOpen(false)} title="Add family member">
        <FamilyMemberForm onDone={onMemberAdded} onCancel={() => setAddMemberOpen(false)} />
      </Modal>
    </div>
  );
}
