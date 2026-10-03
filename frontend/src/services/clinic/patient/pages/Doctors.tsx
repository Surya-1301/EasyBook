import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../../../api/client';
import type { DoctorSummary } from '../../../../api/types';
import { ApiError } from '../../../../api/types';
import { useToast } from '../../../../components/Toast';
import { DoctorCard } from '../../../../components/DoctorCard';
import { EmptyState } from '../../../../components/EmptyState';
import { LoadingState } from '../../../../components/LoadingState';
import { Input } from '../../../../components/Input';
import { Button } from '../../../../components/Button';

import { CLINIC_ID } from '../../../../utils/clinic';

export function Doctors() {
  const navigate = useNavigate();
  const { clinicId: routeClinicId } = useParams();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [doctors, setDoctors] = useState<DoctorSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const q = searchParams.get('q') || '';
  const clinicId = routeClinicId || searchParams.get('clinicId') || CLINIC_ID;
  const [clinicName, setClinicName] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [doctorsRes, clinicRes] = await Promise.all([
          api.clinic.doctors(clinicId),
          api.clinic.get(clinicId),
        ]);
        if (!cancelled) {
          setDoctors(doctorsRes.doctors);
          setClinicName(clinicRes.clinic.name);
        }
      } catch (err) {
        if (!cancelled) toast.error(err instanceof ApiError ? err.message : 'Could not load doctors.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clinicId, toast]);

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
      <div><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Clinic</p><h1 className="mt-1 text-xl font-extrabold text-slate-900">{clinicName || 'Choose doctor'}</h1><p className="mt-1 text-sm text-slate-500">Choose a doctor and book an appointment.</p></div>
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
              <DoctorCard key={d.id} doctor={d} onSelect={() => navigate(`/doctors/${d.id}?clinicId=${encodeURIComponent(clinicId)}`)} />
          ))}
        </div>
      )}
    </div>
  );
}
