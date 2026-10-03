import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../../../api/client';
import type { Patient } from '../../../../api/types';
import { ApiError } from '../../../../api/types';
import { useAuth } from '../../../../auth/AuthContext';
import { useToast } from '../../../../components/Toast';
import { Button } from '../../../../components/Button';
import { Input } from '../../../../components/Input';
import { Select } from '../../../../components/Select';
import { Modal } from '../../../../components/Modal';
import { EmptyState } from '../../../../components/EmptyState';
import { LoadingState } from '../../../../components/LoadingState';
import { isValidIndianPhone, normalizePhone } from '../../../../utils/format';

const GENDERS = ['Male', 'Female', 'Other'];
const RELATIONSHIPS = ['Spouse', 'Child', 'Parent', 'Sibling', 'Other'];

// The API contract accepts `email` on PATCH /patients/me even though the
// generated Patient type omits it, so we read/write it through a narrow cast.
type PatientWithEmail = Patient & { email?: string };

type MemberDraft = {
  fullName: string;
  relationship: string;
  dateOfBirth: string;
  gender: string;
  phone: string;
};

const EMPTY_DRAFT: MemberDraft = { fullName: '', relationship: '', dateOfBirth: '', gender: '', phone: '' };

function MemberForm({
  initial,
  onDone,
  onCancel,
}: {
  initial: MemberDraft;
  onDone: (draft: MemberDraft) => Promise<void>;
  onCancel: () => void;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState<MemberDraft>(initial);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof MemberDraft>(key: K, value: MemberDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!draft.fullName.trim()) {
      toast.error('Enter the full name');
      return;
    }
    if (!draft.relationship) {
      toast.error('Choose the relationship');
      return;
    }
    if (draft.phone && !isValidIndianPhone(draft.phone)) {
      toast.error('Enter a valid 10-digit mobile number');
      return;
    }
    setSaving(true);
    try {
      await onDone(draft);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Input label="Full name" value={draft.fullName} onChange={(e) => set('fullName', e.target.value)} autoFocus />
      <Select
        label="Relationship"
        placeholder="Choose relationship"
        value={draft.relationship}
        options={RELATIONSHIPS.map((r) => ({ value: r, label: r }))}
        onChange={(e) => set('relationship', e.target.value)}
      />
      <Input label="Date of birth" type="date" value={draft.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} />
      <Select
        label="Gender"
        placeholder="Choose gender"
        value={draft.gender}
        options={GENDERS.map((g) => ({ value: g, label: g }))}
        onChange={(e) => set('gender', e.target.value)}
      />
      <Input
        label="Phone (optional)"
        value={draft.phone}
        inputMode="numeric"
        maxLength={10}
        placeholder="10-digit mobile number"
        onChange={(e) => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))}
      />
      <div className="flex gap-2">
        <Button type="button" variant="secondary" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" className="flex-1" loading={saving}>
          Save
        </Button>
      </div>
    </form>
  );
}

export function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    fullName: '',
    dateOfBirth: '',
    gender: '',
    email: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [family, setFamily] = useState<Patient[]>([]);
  const [familyLoading, setFamilyLoading] = useState(true);
  const [memberModal, setMemberModal] = useState<{ mode: 'add' } | { mode: 'edit'; member: Patient } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [meRes, familyRes] = await Promise.all([api.patients.me(), api.patients.family()]);
        if (cancelled) return;
        const p = meRes.patient as PatientWithEmail;
        setForm({
          fullName: p.fullName ?? '',
          dateOfBirth: (p.dateOfBirth ?? '').slice(0, 10),
          gender: p.gender ?? '',
          email: p.email ?? '',
          emergencyContactName: p.emergencyContactName ?? '',
          emergencyContactPhone: p.emergencyContactPhone ?? '',
        });
        setFamily(familyRes.family);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof ApiError ? err.message : 'Could not load your profile.');
      } finally {
        if (!cancelled) {
          setLoading(false);
          setFamilyLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    const errors: Record<string, string> = {};
    if (!form.fullName.trim()) errors.fullName = 'Enter your full name';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errors.email = 'Enter a valid email address';
    if (form.emergencyContactPhone && !isValidIndianPhone(form.emergencyContactPhone))
      errors.emergencyContactPhone = 'Enter a valid 10-digit mobile number';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      const payload: Partial<Patient> & { email?: string } = {
        fullName: form.fullName.trim(),
        dateOfBirth: form.dateOfBirth || undefined,
        gender: form.gender || undefined,
        email: form.email.trim() || undefined,
        emergencyContactName: form.emergencyContactName.trim() || undefined,
        emergencyContactPhone: form.emergencyContactPhone ? normalizePhone(form.emergencyContactPhone) : undefined,
      };
      await api.patients.updateMe(payload);
      toast.success('Details saved');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save your details.');
    } finally {
      setSaving(false);
    }
  }

  async function refreshFamily() {
    try {
      const res = await api.patients.family();
      setFamily(res.family);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not load family members.');
    }
  }

  async function handleMemberSubmit(draft: MemberDraft) {
    try {
      if (memberModal?.mode === 'edit') {
        await api.patients.updateFamily(memberModal.member.id, {
          fullName: draft.fullName.trim(),
          relationship: draft.relationship,
          dateOfBirth: draft.dateOfBirth || undefined,
          gender: draft.gender || undefined,
          phone: draft.phone ? normalizePhone(draft.phone) : undefined,
        });
        toast.success('Family member updated');
      } else {
        await api.patients.addFamily({
          fullName: draft.fullName.trim(),
          relationship: draft.relationship,
          dateOfBirth: draft.dateOfBirth || undefined,
          gender: draft.gender || undefined,
          phone: draft.phone ? normalizePhone(draft.phone) : undefined,
        });
        toast.success('Family member added');
      }
      setMemberModal(null);
      await refreshFamily();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not save the family member.');
    }
  }

  async function confirmDelete() {
    if (!deleteId) return;
    try {
      await api.patients.deleteFamily(deleteId);
      toast.success('Family member removed');
      setDeleteId(null);
      await refreshFamily();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not remove the family member.');
    }
  }

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  if (loading) return <LoadingState message="Loading profile…" />;

  return (
    <div className="space-y-6 px-4 pt-6">
      <div>
        <h1 className="text-xl font-extrabold text-slate-900">Profile</h1>
        {user?.phone && <p className="mt-1 text-sm text-slate-500">Logged in as +91 {user.phone}</p>}
      </div>

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-base font-bold text-slate-900">Your details</h2>
        <Input
          label="Full name"
          value={form.fullName}
          error={fieldErrors.fullName}
          onChange={(e) => set('fullName', e.target.value)}
        />
        <Input
          label="Date of birth"
          type="date"
          value={form.dateOfBirth}
          onChange={(e) => set('dateOfBirth', e.target.value)}
        />
        <Select
          label="Gender"
          placeholder="Choose gender"
          value={form.gender}
          options={GENDERS.map((g) => ({ value: g, label: g }))}
          onChange={(e) => set('gender', e.target.value)}
        />
        <Input
          label="Email"
          type="email"
          value={form.email}
          error={fieldErrors.email}
          placeholder="you@example.com"
          onChange={(e) => set('email', e.target.value)}
        />
        <Input
          label="Emergency contact name"
          value={form.emergencyContactName}
          onChange={(e) => set('emergencyContactName', e.target.value)}
        />
        <Input
          label="Emergency contact phone"
          value={form.emergencyContactPhone}
          inputMode="numeric"
          maxLength={10}
          placeholder="10-digit mobile number"
          error={fieldErrors.emergencyContactPhone}
          onChange={(e) => set('emergencyContactPhone', e.target.value.replace(/\D/g, '').slice(0, 10))}
        />
        <Button loading={saving} onClick={save}>
          Save details
        </Button>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">Family members</h2>
          <Button size="sm" variant="secondary" onClick={() => setMemberModal({ mode: 'add' })}>
            + Add family member
          </Button>
        </div>
        {familyLoading ? (
          <LoadingState message="Loading family…" />
        ) : family.length === 0 ? (
          <EmptyState
            title="No family members yet. Add a family member to book for them."
            action={<Button onClick={() => setMemberModal({ mode: 'add' })}>Add family member</Button>}
          />
        ) : (
          <div className="space-y-2">
            {family.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4">
                <div>
                  <p className="text-base font-bold text-slate-900">{m.fullName}</p>
                  <p className="text-sm text-slate-500">{m.relationship || 'Family member'}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setMemberModal({ mode: 'edit', member: m })}>
                    Edit
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setDeleteId(m.id)}>
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <Button variant="danger" className="w-full" onClick={handleLogout}>
        Log out
      </Button>

      <Modal
        open={memberModal !== null}
        onClose={() => setMemberModal(null)}
        title={memberModal?.mode === 'edit' ? 'Edit family member' : 'Add family member'}
      >
        {memberModal && (
          <MemberForm
            key={memberModal.mode === 'edit' ? memberModal.member.id : 'new'}
            initial={
              memberModal.mode === 'edit'
                ? {
                    fullName: memberModal.member.fullName ?? '',
                    relationship: memberModal.member.relationship ?? '',
                    dateOfBirth: (memberModal.member.dateOfBirth ?? '').slice(0, 10),
                    gender: memberModal.member.gender ?? '',
                    phone: memberModal.member.phone ?? '',
                  }
                : EMPTY_DRAFT
            }
            onDone={handleMemberSubmit}
            onCancel={() => setMemberModal(null)}
          />
        )}
      </Modal>

      <Modal open={deleteId !== null} onClose={() => setDeleteId(null)} title="Remove family member">
        <p className="text-sm text-slate-600">
          Are you sure you want to remove this family member? This cannot be undone.
        </p>
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setDeleteId(null)}>
            Keep
          </Button>
          <Button variant="danger" className="flex-1" onClick={confirmDelete}>
            Remove
          </Button>
        </div>
      </Modal>
    </div>
  );
}
