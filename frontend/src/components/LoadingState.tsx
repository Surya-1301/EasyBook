export function LoadingState({ message = 'Loading…' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16" role="status" aria-live="polite">
      <span className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-brand-600" aria-hidden />
      <p className="mt-3 text-sm text-slate-500">{message}</p>
    </div>
  );
}
