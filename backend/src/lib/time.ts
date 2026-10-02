// Timezone-aware scheduling helpers. All persisted timestamps are UTC ISO strings.
// Clinic-local wall-clock math (schedules, day boundaries) is done with the
// clinic's IANA timezone via the Intl API.

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function partsOf(ms: number, tz: string) {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(ms));
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "0";
  let hour = Number(get("hour"));
  if (hour === 24) hour = 0;
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour,
    minute: Number(get("minute")),
    second: Number(get("second")),
  };
}

/** Convert a clinic-local date + "HH:MM" to a UTC ISO timestamp. */
export function zonedTimeToUtc(date: string, time: string, tz: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const target = Date.UTC(y, m - 1, d, hh, mm, 0);
  let guess = target;
  for (let i = 0; i < 4; i++) {
    const q = partsOf(guess, tz);
    const asUtc = Date.UTC(q.year, q.month - 1, q.day, q.hour, q.minute, q.second);
    const diff = target - asUtc;
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess).toISOString();
}

/** Local date (YYYY-MM-DD) in the given timezone for a UTC ms timestamp. */
export function localDate(ms: number, tz: string): string {
  const p = partsOf(ms, tz);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Local day-of-week (0=Sun..6=Sat) in the given timezone. */
export function localDayOfWeek(ms: number, tz: string): number {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(
    new Date(ms)
  );
  return WEEKDAYS.indexOf(weekday as (typeof WEEKDAYS)[number]);
}

/** Local "HH:MM" in the given timezone for a UTC ms timestamp. */
export function localTime(ms: number, tz: string): string {
  const p = partsOf(ms, tz);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

/** Add N days to a YYYY-MM-DD date string (pure calendar math, tz-safe). */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function minutesToMs(min: number): number {
  return min * 60 * 1000;
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Intervals [aStart,aEnd) and [bStart,bEnd) overlap? Times are "HH:MM". */
export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return timeToMinutes(aStart) < timeToMinutes(bEnd) && timeToMinutes(bStart) < timeToMinutes(aEnd);
}
