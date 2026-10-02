import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { DoctorSummary } from '../../api/types';
import { ApiError } from '../../api/types';
import { useToast } from '../../components/Toast';
import { DoctorCard } from '../../components/DoctorCard';
import { EmptyState } from '../../components/EmptyState';
import { LoadingState } from '../../components/LoadingState';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';

import { CLINIC_ID } from '../../utils/clinic';

export function Doctors() {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [doctors, setDoctors] = useState<DoctorSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const q = searchParams.get('q') || '';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.clinic.doctors(CLINIC_ID);
        if (!cancelled) setDoctors(res.doctors);
      } catch (err) {
        if (!cancelled) toast.error(err instanceof ApiError ? err.message : 'Could not load doctors.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return doctors;
    return doctors.filter(
      (d) =>
        d.name.toLowerCase().includes(needle) || d.specialty.toLowerCase().includes(needle)
    );
  }, [doctors, q]);

  if (loading) return <LoadingState message="Finding doctors…" />;

  return (
    <div className="space-y-4 px-4 pt-6">
      <h1 className="text-xl font-extrabold text-slate-900">Choose doctor</h1>
      <Input
        label="Search"
        value={q}
        placeholder="Doctor name or specialty"
        onChange={(e) => {
          const v = e.target.value;
          setSearchParams(v ? { q: v } : {});
        }}
      />
      {filtered.length === 0 ? (
        <EmptyState
          title="No doctors found"
          message={q ? `No doctors match "${q}". Try a different search.` : 'No doctors are listed right now.'}
          action={
            q ? (
              <Button variant="secondary" onClick={() => setSearchParams({})}>
                Clear search
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((d) => (
            <DoctorCard key={d.id} doctor={d} onSelect={() => navigate(`/doctors/${d.id}`)} />
          ))}
        </div>
      )}
    </div>
  );
}
