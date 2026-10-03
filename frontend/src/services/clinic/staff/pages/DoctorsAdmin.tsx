import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../../api/client';
import { ApiError } from '../../../../api/types';
import type { Doctor } from '../../../../api/types';
import { useToast } from '../../../../components/Toast';
import { Button } from '../../../../components/Button';
import { Input } from '../../../../components/Input';
import { Modal } from '../../../../components/Modal';
import { EmptyState } from '../../../../components/EmptyState';
import { LoadingState } from '../../../../components/LoadingState';
import { formatINR } from '../../../../utils/format';

type DoctorForm = {
  name: string;
  specialty: string;
  qualification: string;
  experienceYears: string;
  languages: string;
  bio: string;
  consultationFee: string;
};

const emptyForm: DoctorForm = {
  name: '',
  specialty: '',
  qualification: '',
  experienceYears: '',
  languages: '',
  bio: '',
  consultationFee: '',
};

function toForm(d: Doctor): DoctorForm {
  return {
    name: d.name || '',
    specialty: d.specialty || '',
    qualification: d.qualification || '',
    experienceYears: d.experienceYears != null ? String(d.experienceYears) : '',
    languages: (d.languages || []).join(', '),
    bio: d.bio || '',
    consultationFee: d.consultationFee != null ? String(d.consultationFee) : '',
  };
}

function DoctorFormModal({
  title,
  initial,
  submitLabel,
  onClose,
  onSubmit,
}: {
  title: string;
  initial: DoctorForm;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (body: Partial<Doctor>) => Promise<void>;
}) {
  const toast = useToast();
  const [form, setForm] = useState<DoctorForm>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  function set<K extends keyof DoctorForm>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function handle(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Name is required.';
    if (!form.specialty.trim()) errs.specialty = 'Specialty is required.';
    const fee = parseFloat(form.consultationFee);
    if (Number.isNaN(fee) || fee < 0) errs.consultationFee = 'Enter a valid fee.';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setSaving(true);
    try {
      const years = parseInt(form.experienceYears, 10);
      await onSubmit({
        name: form.name.trim(),
        specialty: form.specialty.trim(),
        qualification: form.qualification.trim() || undefined,
        experienceYears: Number.isNaN(years) ? undefined : years,
        languages: form.languages
          .split(',')
          .map((l) => l.trim())
          .filter(Boolean),
        bio: form.bio.trim() || undefined,
        consultationFee: fee,
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save the doctor.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={title} wide>
      <form onSubmit={handle} className="grid gap-4 sm:grid-cols-2">
        <Input label="Name" value={form.name} onChange={(e) => set('name', e.target.value)} error={errors.name} />
        <Input
          label="Specialty"
          value={form.specialty}
          onChange={(e) => set('specialty', e.target.value)}
          error={errors.specialty}
        />
        <Input
          label="Qualification"
          value={form.qualification}
          onChange={(e) => set('qualification', e.target.value)}
        />
        <Input
          label="Experience (years)"
          type="number"
          min={0}
          value={form.experienceYears}
          onChange={(e) => set('experienceYears', e.target.value)}
        />
        <Input
          label="Languages (comma-separated)"
          value={form.languages}
          onChange={(e) => set('languages', e.target.value)}
          placeholder="English, Hindi"
        />
        <Input
          label="Consultation fee (₹)"
          type="number"
          min={0}
          value={form.consultationFee}
          onChange={(e) => set('consultationFee', e.target.value)}
          error={errors.consultationFee}
        />
        <Input
          label="Bio"
          value={form.bio}
          onChange={(e) => set('bio', e.target.value)}
          className="sm:col-span-2"
        />
        <div className="sm:col-span-2">
          <Button type="submit" className="w-full" loading={saving}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function DoctorsAdmin() {
  const toast = useToast();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Doctor | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.admin
      .doctors()
      .then((res) => {
        if (!cancelled) setDoctors(res.doctors);
      })
      .catch((err: unknown) => {
        if (!cancelled) toast.error(err instanceof ApiError ? err.message : 'Could not load doctors.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reload, toast]);

  async function toggleStatus(d: Doctor) {
    setToggling(d.id);
    try {
      await api.admin.setDoctorStatus(d.id, !(d.isActive ?? true));
      toast.success(d.isActive === false ? 'Doctor activated.' : 'Doctor deactivated.');
      setReload((r) => r + 1);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update status.');
    } finally {
      setToggling(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Doctors</h1>
        <Button onClick={() => setShowAdd(true)}>+ Add doctor</Button>
      </div>

      <div className="mt-6">
        {loading ? (
          <LoadingState message="Loading doctors…" />
        ) : doctors.length === 0 ? (
          <EmptyState title="Add your first doctor to start scheduling." />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Specialty</th>
                  <th className="px-4 py-3 font-semibold">Fee</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {doctors.map((d) => {
                  const active = d.isActive ?? true;
                  return (
                    <tr key={d.id}>
                      <td className="px-4 py-3 font-medium text-slate-900">{d.name}</td>
                      <td className="px-4 py-3 text-slate-600">{d.specialty}</td>
                      <td className="px-4 py-3 text-slate-600">{formatINR(d.consultationFee)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                            active
                              ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
                              : 'border-slate-300 bg-slate-100 text-slate-600'
                          }`}
                        >
                          {active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1.5">
                          <Link to={`/admin/doctors/${d.id}/schedule`}>
                            <Button size="sm" variant="secondary">
                              Schedule
                            </Button>
                          </Link>
                          <Button size="sm" variant="secondary" onClick={() => setEditing(d)}>
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={toggling === d.id}
                            onClick={() => toggleStatus(d)}
                          >
                            {active ? 'Deactivate' : 'Activate'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && (
        <DoctorFormModal
          title="Add doctor"
          initial={emptyForm}
          submitLabel="Add doctor"
          onClose={() => setShowAdd(false)}
          onSubmit={async (body) => {
            await api.admin.createDoctor(body);
            toast.success('Doctor added.');
            setShowAdd(false);
            setReload((r) => r + 1);
          }}
        />
      )}
      {editing && (
        <DoctorFormModal
          title={`Edit — ${editing.name}`}
          initial={toForm(editing)}
          submitLabel="Save changes"
          onClose={() => setEditing(null)}
          onSubmit={async (body) => {
            await api.admin.updateDoctor(editing.id, body);
            toast.success('Doctor updated.');
            setEditing(null);
            setReload((r) => r + 1);
          }}
        />
      )}
    </div>
  );
}
