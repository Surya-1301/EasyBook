// Shared helpers: phone validation, date/time formatting.

export const INDIAN_PHONE_RE = /^[6-9]\d{9}$/;

export function normalizePhone(input: string): string {
  return input.replace(/\D/g, '').replace(/^(91|0)/, '').slice(-10);
}

export function isValidIndianPhone(input: string): boolean {
  return INDIAN_PHONE_RE.test(normalizePhone(input));
}

export function formatINR(amount: number): string {
  return `₹${Number(amount).toLocaleString('en-IN')}`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function formatDateLong(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export function formatDateTime(iso: string): string {
  return `${formatDate(iso)} • ${formatTime(iso)}`;
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function dayLabel(isoDate: string): string {
  const today = toISODate(new Date());
  const tomorrow = toISODate(new Date(Date.now() + 86400000));
  if (isoDate === today) return 'Today';
  if (isoDate === tomorrow) return 'Tomorrow';
  const d = new Date(isoDate + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Build the next N calendar days as YYYY-MM-DD strings, starting today. */
export function nextDays(n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(toISODate(new Date(Date.now() + i * 86400000)));
  }
  return out;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
