import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../../api/client';
import { ApiError } from '../../api/types';
import type { Role, StaffMember } from '../../api/types';
import { useToast } from '../../components/Toast';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Select } from '../../components/Select';
import { Modal } from '../../components/Modal';
import { EmptyState } from '../../components/EmptyState';
import { LoadingState } from '../../components/LoadingState';
import { isValidIndianPhone, normalizePhone } from '../../utils/format';

const ROLES: Role[] = ['RECEPTIONIST', 'DOCTOR', 'CLINIC_ADMIN'];

const roleLabels: Record<Role, string> = {
  PATIENT: 'Patient',
  RECEPTIONIST: 'Receptionist',
  CLINIC_ADMIN: 'Clinic admin',
  DOCTOR: 'Doctor',
};

function AddStaffModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('RECEPTIONIST');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function handle(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Name is required.';
    if (!isValidIndianPhone(phone)) errs.phone = 'Enter a valid 10-digit mobile number.';
    if (password.length < 6) errs.password = 'Password must be at least 6 characters.';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setSaving(true);
    try {
      await api.admin.createStaff({
        name: name.trim(),
        email: email.trim() || undefined,
        phone: normalizePhone(phone),
        password,
        role,
      });
      toast.success('Staff member added.');
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not add staff.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Add staff">
      <form onSubmit={handle} className="space-y-4">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
        <Input
          label="Email (optional)"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          label="Mobile number"
          value={phone}
          inputMode="numeric"
          maxLength={10}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
          error={errors.phone}
        />
        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
        />
        <Select
          label="Role"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          options={ROLES.map((r) => ({ value: r, label: roleLabels[r] }))}
        />
        <Button type="submit" className="w-full" loading={saving}>
          Add staff
        </Button>
      </form>
    </Modal>
  );
}

function EditStaffModal({
  member,
  onClose,
  onDone,
}: {
  member: StaffMember;
  onClose: () => void;
  onDone: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(member.name);
  const [role, setRole] = useState<Role>(member.role);
  const [isActive, setIsActive] = useState(member.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handle(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await api.admin.updateStaff(member.id, { name: name.trim(), role, isActive });
      toast.success('Staff member updated.');
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not update staff.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Edit — ${member.name}`}>
      <form onSubmit={handle} className="space-y-4">
        <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} error={error || undefined} />
        <Select
          label="Role"
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          options={ROLES.map((r) => ({ value: r, label: roleLabels[r] }))}
        />
        <label className="flex min-h-[48px] cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-5 w-5 rounded accent-brand-600"
          />
          <span className="text-sm font-medium text-slate-800">Active</span>
        </label>
        <Button type="submit" className="w-full" loading={saving}>
          Save changes
        </Button>
      </form>
    </Modal>
  );
}

export function StaffList() {
  const toast = useToast();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.admin
      .staff()
      .then((res) => {
        if (!cancelled) setStaff(res.staff);
      })
      .catch((err: unknown) => {
        if (!cancelled) toast.error(err instanceof ApiError ? err.message : 'Could not load staff.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reload, toast]);

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Staff</h1>
        <Button onClick={() => setShowAdd(true)}>+ Add staff</Button>
      </div>

      <div className="mt-6">
        {loading ? (
          <LoadingState message="Loading staff…" />
        ) : staff.length === 0 ? (
          <EmptyState title="No staff members yet." message="Add receptionists, doctors and admins here." />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Contact</th>
                  <th className="px-4 py-3 font-semibold">Role</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {staff.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">{m.name}</td>
                    <td className="px-4 py-3 text-slate-600">
                      <p>{m.phone}</p>
                      {m.email && <p className="text-xs text-slate-500">{m.email}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full border border-slate-300 bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                        {roleLabels[m.role] || m.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                          m.isActive === false
                            ? 'border-slate-300 bg-slate-100 text-slate-600'
                            : 'border-emerald-300 bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {m.isActive === false ? 'Inactive' : 'Active'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="secondary" onClick={() => setEditing(m)}>
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && (
        <AddStaffModal
          onClose={() => setShowAdd(false)}
          onDone={() => {
            setShowAdd(false);
            setReload((r) => r + 1);
          }}
        />
      )}
      {editing && (
        <EditStaffModal
          member={editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            setReload((r) => r + 1);
          }}
        />
      )}
    </div>
  );
}
