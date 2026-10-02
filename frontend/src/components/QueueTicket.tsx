export function QueueTicket({
  tokenNumber,
  patientName,
  nowServingToken,
  patientsBefore,
  estimatedWaitMinutes,
}: {
  tokenNumber: number;
  patientName?: string;
  nowServingToken: number | null;
  patientsBefore: number;
  estimatedWaitMinutes: number;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
      <p className="text-sm font-medium uppercase tracking-wide text-slate-500">Your token</p>
      <p className="mt-1 text-5xl font-extrabold text-brand-700">#{tokenNumber}</p>
      {patientName && <p className="mt-1 text-sm text-slate-600">{patientName}</p>}
      <div className="mt-6 grid grid-cols-2 gap-3 text-left">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Now serving</p>
          <p className="text-xl font-bold text-slate-900">
            {nowServingToken != null ? `#${nowServingToken}` : '—'}
          </p>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs text-slate-500">Patients before you</p>
          <p className="text-xl font-bold text-slate-900">{patientsBefore}</p>
        </div>
      </div>
      <p className="mt-4 text-sm text-slate-600">
        Estimated wait <span className="font-bold text-slate-900">~{estimatedWaitMinutes} min</span>
      </p>
      <p className="mt-2 text-xs text-slate-400">Times are estimates — please be seated in the waiting area.</p>
    </div>
  );
}
