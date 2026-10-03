import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../../api/client';
import { ApiError } from '../../../../api/types';
import type { DoctorSummary, Service } from '../../../../api/types';
import { useToast } from '../../../../components/Toast';
import { Button } from '../../../../components/Button';
import { Input } from '../../../../components/Input';
import { Select } from '../../../../components/Select';
import { LoadingState } from '../../../../components/LoadingState';
import { isValidIndianPhone, normalizePhone } from '../../../../utils/format';

import { CLINIC_ID } from '../../../../utils/clinic';

type Done = { token: number; patientName: string; doctorName: string };

export function NewWalkIn() {
  const toast = useToast();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [doctors, setDoctors] = useState<DoctorSummary[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<Done | null>(null);

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
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [toast]);

  function reset() {
    setPhone('');
    setName('');
    setDoctorId('');
    setServiceId('');
    setErrors({});
    setDone(null);
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!isValidIndianPhone(phone)) e.phone = 'Enter a valid 10-digit mobile number.';
    if (!name.trim()) e.name = 'Patient name is required.';
    if (!doctorId) e.doctor = 'Choose a doctor.';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      const res = await api.reception.walkIn({
        newPatient: { fullName: name.trim(), phone: normalizePhone(phone) },
        doctorId,
        serviceId: serviceId || undefined,
      });
      const doctorName = doctors.find((d) => d.id === doctorId)?.name || 'Doctor';
      setDone({ token: res.queueTicket.tokenNumber, patientName: name.trim(), doctorName });
      toast.success(`Walk-in added — token #${res.queueTicket.tokenNumber}.`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not add the walk-in.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <LoadingState message="Loading…" />;

  if (done) {
    return (
      <div className="mx-auto max-w-md p-4 sm:p-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <p className="text-sm font-medium text-slate-500">Walk-in added</p>
          <p className="mt-3 text-6xl font-bold text-brand-600">Token #{done.token}</p>
          <p className="mt-4 text-lg font-semibold text-slate-900">{done.patientName}</p>
          <p className="text-sm text-slate-500">{done.doctorName}</p>
          <div className="mt-8 flex flex-col gap-2">
            <Button size="lg" onClick={reset}>
              Add another walk-in
            </Button>
            <Link to="/admin/today">
              <Button variant="secondary" size="lg" className="w-full">
                Back to dashboard
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
      <h1 className="text-2xl font-bold text-slate-900">Add walk-in</h1>
      <p className="mt-1 text-sm text-slate-500">Patient is here in person — skip the booking step.</p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <Input
          label="Mobile number"
          value={phone}
          inputMode="numeric"
          maxLength={10}
          placeholder="98765 43210"
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
          error={errors.phone}
        />
        <Input
          label="Patient name"
          value={name}
          onChange={(e) => setName(e.target.value)}
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
        <Select
          label="Service (optional)"
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
          options={services.map((s) => ({
            value: s.id,
            label: `${s.name} · ${s.durationMinutes} min`,
          }))}
          placeholder="None"
        />
        <Button type="submit" size="lg" className="w-full" loading={submitting}>
          Add to queue
        </Button>
      </form>
    </div>
  );
}
