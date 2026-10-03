import { useEffect, useState } from 'react';
import { api } from '../../../../api/client';
import { ApiError } from '../../../../api/types';
import type { DayStats } from '../../../../api/types';
import { useToast } from '../../../../components/Toast';
import { Button } from '../../../../components/Button';
import { LoadingState } from '../../../../components/LoadingState';
import { dayLabel, toISODate } from '../../../../utils/format';

type DoctorRow = {
  doctorId: string;
  doctorName: string;
  total: number;
  completed: number;
  waiting: number;
  checkedIn: number;
  cancelled: number;
  noShow: number;
};

function StatCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function Reports() {
  const toast = useToast();
  const [stats, setStats] = useState<DayStats | null>(null);
  const [byDoctor, setByDoctor] = useState<DoctorRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api.admin
      .reportsToday()
      .then((res) => {
        if (cancelled) return;
        setStats(res.stats);
        setByDoctor(res.byDoctor);
      })
      .catch((err: unknown) => {
        if (!cancelled) toast.error(err instanceof ApiError ? err.message : 'Could not load the report.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [toast]);

  function exportCsv() {
    const headers = ['Doctor', 'Total', 'Completed', 'Waiting', 'Checked in', 'Cancelled', 'No-show'];
    const lines = [
      headers.map(csvCell).join(','),
      ...byDoctor.map((r) =>
        [r.doctorName, r.total, r.completed, r.waiting, r.checkedIn, r.cancelled, r.noShow]
          .map(csvCell)
          .join(',')
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `clinic-report-${toISODate(new Date())}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  if (loading) return <LoadingState message="Loading report…" />;

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Today&apos;s report — {dayLabel(toISODate(new Date()))}</h1>
        <Button variant="secondary" onClick={exportCsv} disabled={byDoctor.length === 0}>
          Export CSV
        </Button>
      </div>

      {stats && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-6">
          <StatCard label="Total" value={stats.total} tone="text-slate-900" />
          <StatCard label="Completed" value={stats.completed} tone="text-emerald-600" />
          <StatCard label="Waiting" value={stats.waiting} tone="text-amber-600" />
          <StatCard label="Checked in" value={stats.checkedIn} tone="text-indigo-600" />
          <StatCard label="Cancelled" value={stats.cancelled} tone="text-red-600" />
          <StatCard label="No-show" value={stats.noShow} tone="text-orange-600" />
        </div>
      )}

      <h2 className="mt-8 text-lg font-bold text-slate-900">By doctor</h2>
      <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Doctor</th>
              <th className="px-4 py-3 font-semibold">Total</th>
              <th className="px-4 py-3 font-semibold">Completed</th>
              <th className="px-4 py-3 font-semibold">Waiting</th>
              <th className="px-4 py-3 font-semibold">Checked in</th>
              <th className="px-4 py-3 font-semibold">Cancelled</th>
              <th className="px-4 py-3 font-semibold">No-show</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {byDoctor.map((r) => (
              <tr key={r.doctorId}>
                <td className="px-4 py-3 font-medium text-slate-900">{r.doctorName}</td>
                <td className="px-4 py-3 text-slate-600">{r.total}</td>
                <td className="px-4 py-3 text-slate-600">{r.completed}</td>
                <td className="px-4 py-3 text-slate-600">{r.waiting}</td>
                <td className="px-4 py-3 text-slate-600">{r.checkedIn}</td>
                <td className="px-4 py-3 text-slate-600">{r.cancelled}</td>
                <td className="px-4 py-3 text-slate-600">{r.noShow}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
