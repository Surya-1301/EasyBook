import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../../../../api/client';
import { ApiError } from '../../../../api/types';
import type { Service } from '../../../../api/types';
import { useToast } from '../../../../components/Toast';
import { Button } from '../../../../components/Button';
import { Input } from '../../../../components/Input';
import { Modal } from '../../../../components/Modal';
import { EmptyState } from '../../../../components/EmptyState';
import { LoadingState } from '../../../../components/LoadingState';
import { formatINR } from '../../../../utils/format';

function ServiceModal({
  title,
  initial,
  submitLabel,
  onClose,
  onSubmit,
}: {
  title: string;
  initial: { name: string; description: string; durationMinutes: string; fee: string };
  submitLabel: string;
  onClose: () => void;
  onSubmit: (body: { name: string; description?: string; durationMinutes: number; fee: number }) => Promise<void>;
}) {
  const toast = useToast();
  const [name, setName] = useState(initial.name);
  const [description, setDescription] = useState(initial.description);
  const [durationMinutes, setDurationMinutes] = useState(initial.durationMinutes);
  const [fee, setFee] = useState(initial.fee);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function handle(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Name is required.';
    const mins = parseInt(durationMinutes, 10);
    if (Number.isNaN(mins) || mins <= 0) errs.durationMinutes = 'Enter a valid duration.';
    const f = parseFloat(fee);
    if (Number.isNaN(f) || f < 0) errs.fee = 'Enter a valid fee.';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
        durationMinutes: mins,
        fee: f,
      });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save the service.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={title}>
      <form onSubmit={handle} className="space-y-4">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
        <Input
          label="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Duration (minutes)"
            type="number"
            min={1}
            value={durationMinutes}
            onChange={(e) => setDurationMinutes(e.target.value)}
            error={errors.durationMinutes}
          />
          <Input
            label="Fee (₹)"
            type="number"
            min={0}
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            error={errors.fee}
          />
        </div>
        <Button type="submit" className="w-full" loading={saving}>
          {submitLabel}
        </Button>
      </form>
    </Modal>
  );
}

export function Services() {
  const toast = useToast();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.admin
      .services()
      .then((res) => {
        if (!cancelled) setServices(res.services);
      })
      .catch((err: unknown) => {
        if (!cancelled) toast.error(err instanceof ApiError ? err.message : 'Could not load services.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reload, toast]);

  async function remove(id: string) {
    if (!window.confirm('Delete this service?')) return;
    setDeletingId(id);
    try {
      await api.admin.deleteService(id);
      toast.success('Service deleted.');
      setReload((r) => r + 1);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not delete the service.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Services</h1>
        <Button onClick={() => setShowAdd(true)}>+ Add service</Button>
      </div>

      <div className="mt-6">
        {loading ? (
          <LoadingState message="Loading services…" />
        ) : services.length === 0 ? (
          <EmptyState title="No services yet." message="Add your first service, e.g. General Consultation." />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Duration</th>
                  <th className="px-4 py-3 font-semibold">Fee</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {services.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{s.name}</p>
                      {s.description && <p className="text-xs text-slate-500">{s.description}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{s.durationMinutes} min</td>
                    <td className="px-4 py-3 text-slate-600">{formatINR(s.fee)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="secondary" onClick={() => setEditing(s)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={deletingId === s.id}
                          onClick={() => remove(s.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && (
        <ServiceModal
          title="Add service"
          initial={{ name: '', description: '', durationMinutes: '30', fee: '' }}
          submitLabel="Add service"
          onClose={() => setShowAdd(false)}
          onSubmit={async (body) => {
            await api.admin.createService(body);
            toast.success('Service added.');
            setShowAdd(false);
            setReload((r) => r + 1);
          }}
        />
      )}
      {editing && (
        <ServiceModal
          title={`Edit — ${editing.name}`}
          initial={{
            name: editing.name,
            description: editing.description || '',
            durationMinutes: String(editing.durationMinutes),
            fee: String(editing.fee),
          }}
          submitLabel="Save changes"
          onClose={() => setEditing(null)}
          onSubmit={async (body) => {
            await api.admin.updateService(editing.id, body);
            toast.success('Service updated.');
            setEditing(null);
            setReload((r) => r + 1);
          }}
        />
      )}
    </div>
  );
}
