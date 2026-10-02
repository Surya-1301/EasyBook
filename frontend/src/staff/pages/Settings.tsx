import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../../api/client';
import { ApiError } from '../../api/types';
import { useToast } from '../../components/Toast';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { LoadingState } from '../../components/LoadingState';

const num = (v: string): number | undefined => {
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? undefined : n;
};

export function Settings() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [description, setDescription] = useState('');

  const [maxAdvanceDays, setMaxAdvanceDays] = useState('');
  const [minAdvanceMinutes, setMinAdvanceMinutes] = useState('');
  const [cancellationCutoffMinutes, setCancellationCutoffMinutes] = useState('');
  const [rescheduleCutoffMinutes, setRescheduleCutoffMinutes] = useState('');

  const [walkInsEnabled, setWalkInsEnabled] = useState(true);
  const [patientSelfCheckInEnabled, setPatientSelfCheckInEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.admin
      .getClinic()
      .then((res) => {
        if (cancelled) return;
        const c = res.clinic;
        setName(c.name || '');
        setPhone(c.phone || '');
        setAddress(c.address || '');
        setCity(c.city || '');
        setState(c.state || '');
        setPostalCode(c.postalCode || '');
        setDescription(c.description || '');
        const b = c.settings?.booking || {};
        setMaxAdvanceDays(b.maxAdvanceDays != null ? String(b.maxAdvanceDays) : '');
        setMinAdvanceMinutes(b.minAdvanceMinutes != null ? String(b.minAdvanceMinutes) : '');
        setCancellationCutoffMinutes(
          b.cancellationCutoffMinutes != null ? String(b.cancellationCutoffMinutes) : ''
        );
        setRescheduleCutoffMinutes(
          b.rescheduleCutoffMinutes != null ? String(b.rescheduleCutoffMinutes) : ''
        );
        const q = c.settings?.queue || {};
        setWalkInsEnabled(q.walkInsEnabled ?? true);
        setPatientSelfCheckInEnabled(q.patientSelfCheckInEnabled ?? false);
      })
      .catch((err: unknown) => {
        if (!cancelled) toast.error(err instanceof ApiError ? err.message : 'Could not load settings.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [toast]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Clinic name is required.');
      return;
    }
    setSaving(true);
    try {
      await api.admin.updateClinic({
        name: name.trim(),
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        postalCode: postalCode.trim() || undefined,
        description: description.trim() || undefined,
        settings: {
          booking: {
            maxAdvanceDays: num(maxAdvanceDays),
            minAdvanceMinutes: num(minAdvanceMinutes),
            cancellationCutoffMinutes: num(cancellationCutoffMinutes),
            rescheduleCutoffMinutes: num(rescheduleCutoffMinutes),
          },
          queue: { walkInsEnabled, patientSelfCheckInEnabled },
        },
      });
      toast.success('Settings saved.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save settings.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState message="Loading settings…" />;

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <h1 className="text-2xl font-bold text-slate-900">Clinic settings</h1>

      <form onSubmit={onSubmit} className="mt-6 space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-base font-bold text-slate-900">Clinic profile</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Input label="Clinic name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <Input
              label="Address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="sm:col-span-2"
            />
            <Input label="City" value={city} onChange={(e) => setCity(e.target.value)} />
            <Input label="State" value={state} onChange={(e) => setState(e.target.value)} />
            <Input label="Postal code" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
            <Input
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="sm:col-span-2"
            />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-base font-bold text-slate-900">Booking policy</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Input
              label="Max advance booking (days)"
              type="number"
              min={0}
              value={maxAdvanceDays}
              onChange={(e) => setMaxAdvanceDays(e.target.value)}
            />
            <Input
              label="Min advance booking (minutes)"
              type="number"
              min={0}
              value={minAdvanceMinutes}
              onChange={(e) => setMinAdvanceMinutes(e.target.value)}
            />
            <Input
              label="Cancellation cutoff (minutes)"
              type="number"
              min={0}
              value={cancellationCutoffMinutes}
              onChange={(e) => setCancellationCutoffMinutes(e.target.value)}
            />
            <Input
              label="Reschedule cutoff (minutes)"
              type="number"
              min={0}
              value={rescheduleCutoffMinutes}
              onChange={(e) => setRescheduleCutoffMinutes(e.target.value)}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-base font-bold text-slate-900">Queue</h2>
          <label className="mt-4 flex min-h-[48px] cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={walkInsEnabled}
              onChange={(e) => setWalkInsEnabled(e.target.checked)}
              className="h-5 w-5 rounded accent-brand-600"
            />
            <span className="text-sm font-medium text-slate-800">Allow walk-ins</span>
          </label>
          <label className="flex min-h-[48px] cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={patientSelfCheckInEnabled}
              onChange={(e) => setPatientSelfCheckInEnabled(e.target.checked)}
              className="h-5 w-5 rounded accent-brand-600"
            />
            <span className="text-sm font-medium text-slate-800">Patients can check themselves in</span>
          </label>
        </section>

        <Button type="submit" size="lg" loading={saving}>
          Save settings
        </Button>
      </form>
    </div>
  );
}
