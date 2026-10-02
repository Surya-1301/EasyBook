import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { ApiError } from '../../api/types';
import { useToast } from '../../components/Toast';
import { Button } from '../../components/Button';
import { QueueTicket } from '../../components/QueueTicket';
import { EmptyState } from '../../components/EmptyState';
import { LoadingState } from '../../components/LoadingState';
import { formatDateTime } from '../../utils/format';

const CLINIC_ID = (import.meta.env.VITE_CLINIC_ID as string | undefined) || 'demo-clinic';

type QueueMy = Awaited<ReturnType<typeof api.queue.my>>;

export function QueueView() {
  const { appointmentId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [data, setData] = useState<QueueMy | null>(null);
  const [clinicPhone, setClinicPhone] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (quiet = false) => {
      if (!appointmentId) return;
      if (!quiet) setLoading(true);
      try {
        const res = await api.queue.my(appointmentId);
        setData(res);
        setNotFound(false);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'NOT_FOUND') {
          setData(null);
          setNotFound(true);
        } else if (!quiet) {
          toast.error(err instanceof ApiError ? err.message : 'Could not load the queue.');
        }
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [appointmentId, toast]
  );

  useEffect(() => {
    load();
    let cancelled = false;
    api.clinic
      .get(CLINIC_ID)
      .then((res) => {
        if (!cancelled) setClinicPhone(res.clinic.phone);
      })
      .catch(() => undefined);
    const timer = window.setInterval(() => {
      load(true);
    }, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }

  if (loading) return <LoadingState message="Loading your queue status…" />;

  if (notFound || !data) {
    return (
      <div className="px-4 pt-6">
        <EmptyState
          title="You're not in the queue yet. Check in when you arrive."
          action={<Button onClick={() => navigate(-1)}>Back</Button>}
        />
      </div>
    );
  }

  const { ticket, nowServingToken, patientsBefore, estimatedWaitMinutes, doctorName, appointmentTime } = data;

  return (
    <div className="space-y-5 px-4 pt-6">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">Live queue</h1>
          <p className="mt-1 text-sm text-slate-600">{doctorName}</p>
          <p className="text-sm text-slate-500">{formatDateTime(appointmentTime)}</p>
        </div>
        <Button variant="secondary" size="sm" loading={refreshing} onClick={refresh}>
          Refresh
        </Button>
      </div>

      <QueueTicket
        tokenNumber={ticket.tokenNumber}
        patientName={ticket.patient.fullName}
        nowServingToken={nowServingToken}
        patientsBefore={patientsBefore}
        estimatedWaitMinutes={estimatedWaitMinutes}
      />

      {clinicPhone && (
        <a href={`tel:${clinicPhone.replace(/\s/g, '')}`} className="block">
          <Button variant="secondary" className="w-full">
            Call Clinic
          </Button>
        </a>
      )}
    </div>
  );
}
