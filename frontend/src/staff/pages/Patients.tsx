import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../../api/client';
import { ApiError } from '../../api/types';
import { useToast } from '../../components/Toast';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Select } from '../../components/Select';
import { Modal } from '../../components/Modal';
import { EmptyState } from '../../components/EmptyState';
import { LoadingState } from '../../components/LoadingState';
import { formatDate, isValidIndianPhone, normalizePhone } from '../../utils/format';

type SearchResult = { id: string; fullName: string; phoneMasked: string; lastVisit?: string };

function AddPatientModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('');
  const [warning, setWarning] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!fullName.trim()) e.fullName = 'Name is required.';
    if (!isValidIndianPhone(phone)) e.phone = 'Enter a valid 10-digit mobile number.';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    setWarning('');
    try {
      const res = await api.reception.createPatient({
        fullName: fullName.trim(),
        phone: normalizePhone(phone),
        dateOfBirth: dateOfBirth || undefined,
        gender: gender || undefined,
      });
      if (res.duplicateWarning) {
        setWarning(res.duplicateWarning);
        toast.success('Patient added (possible duplicate).');
      } else {
        toast.success('Patient added.');
      }
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not add patient.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Add patient">
      {warning && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800" role="alert">
          {warning}
        </div>
      )}
      <form onSubmit={onSubmit} className="space-y-4">
        <Input
          label="Full name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          error={errors.fullName}
        />
        <Input
          label="Mobile number"
          value={phone}
          inputMode="numeric"
          maxLength={10}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
          error={errors.phone}
        />
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Date of birth (optional)"
            type="date"
            value={dateOfBirth}
            onChange={(e) => setDateOfBirth(e.target.value)}
          />
          <Select
            label="Gender (optional)"
            value={gender}
            onChange={(e) => setGender(e.target.value)}
            options={[
              { value: 'male', label: 'Male' },
              { value: 'female', label: 'Female' },
              { value: 'other', label: 'Other' },
            ]}
          />
        </div>
        <Button type="submit" className="w-full" loading={saving}>
          Add patient
        </Button>
      </form>
    </Modal>
  );
}

export function Patients() {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [reload, setReload] = useState(0);
  const [showAdd, setShowAdd] = useState(false);

  // Debounced search (400ms).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }
    setSearching(true);
    const t = window.setTimeout(() => {
      api.reception
        .patientsSearch(q)
        .then((res) => {
          setResults(res.patients);
          setSearched(true);
        })
        .catch((err: unknown) => {
          toast.error(err instanceof ApiError ? err.message : 'Search failed.');
        })
        .finally(() => setSearching(false));
    }, 400);
    return () => window.clearTimeout(t);
  }, [query, reload, toast]);

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Patients</h1>
        <Button onClick={() => setShowAdd(true)}>+ Add patient</Button>
      </div>

      <div className="mt-4">
        <Input
          label="Search patients"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Phone number, name or appointment number"
        />
      </div>

      <div className="mt-4">
        {searching ? (
          <LoadingState message="Searching…" />
        ) : !searched ? (
          <EmptyState title="Search by phone, name or appointment number." />
        ) : results.length === 0 ? (
          <EmptyState title="No patients found." message="Try a different phone number or name." />
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {results.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{p.fullName}</p>
                  <p className="text-xs text-slate-500">{p.phoneMasked}</p>
                </div>
                <span className="shrink-0 text-xs text-slate-500">
                  {p.lastVisit ? `Last visit: ${formatDate(p.lastVisit)}` : 'No visits yet'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showAdd && (
        <AddPatientModal
          onClose={() => setShowAdd(false)}
          onDone={() => {
            setShowAdd(false);
            setReload((r) => r + 1);
          }}
        />
      )}
    </div>
  );
}
