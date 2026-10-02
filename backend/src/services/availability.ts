import { db, row, rows } from "../db";
import { mergeSettings } from "../types";
import {
  addDays,
  localDate,
  localDayOfWeek,
  minutesToTime,
  nowIso,
  overlaps,
  timeToMinutes,
  zonedTimeToUtc,
} from "../lib/time";

export type SlotStatus = "AVAILABLE" | "BOOKED" | "BLOCKED";

export interface Slot {
  startAt: string;
  endAt: string;
  status: SlotStatus;
}

interface Recurring {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  break_start_time: string | null;
  break_end_time: string | null;
  slot_duration_minutes: number | null;
  effective_from: string;
  effective_to: string | null;
}

interface Exception {
  id: string;
  type: "LEAVE" | "BLOCK" | "CUSTOM_HOURS" | "EXTRA_HOURS";
  start_time: string | null;
  end_time: string | null;
}

export interface AvailabilityResult {
  ok: boolean;
  reason?: "PAST_DATE" | "TOO_FAR" | "DOCTOR_INACTIVE";
  slots: Slot[];
  date: string;
}

/**
 * Generate slots for a doctor on a clinic-local date.
 * Windows come from recurring_schedules, adjusted by schedule_exceptions:
 *  - LEAVE: whole day unavailable
 *  - CUSTOM_HOURS: replaces the normal windows for that day
 *  - BLOCK: generated slots overlapping the window are marked BLOCKED
 *  - EXTRA_HOURS: additional windows appended
 * Then subtract active appointments/holds, and enforce booking policy
 * (maxAdvanceDays / minAdvanceMinutes).
 */
export function generateAvailability(
  doctorId: string,
  date: string,
  slotDurationMinutes?: number
): AvailabilityResult {
  const doctor = row<{ id: string; clinic_id: string; status: string }>(
    "SELECT id, clinic_id, status FROM doctors WHERE id = ?",
    doctorId
  );
  if (!doctor) return { ok: false, reason: "DOCTOR_INACTIVE", slots: [], date };
  if (doctor.status !== "ACTIVE") return { ok: false, reason: "DOCTOR_INACTIVE", slots: [], date };

  const clinic = row<{ timezone: string; settings: string | null }>(
    "SELECT timezone, settings FROM clinics WHERE id = ?",
    doctor.clinic_id
  );
  const tz = clinic?.timezone ?? "Asia/Kolkata";
  const settings = mergeSettings(clinic?.settings ?? null);

  const todayLocal = localDate(Date.now(), tz);
  if (date < todayLocal) return { ok: false, reason: "PAST_DATE", slots: [], date };
  if (date > addDays(todayLocal, settings.booking.maxAdvanceDays)) {
    return { ok: false, reason: "TOO_FAR", slots: [], date };
  }

  const dow = localDayOfWeek(Date.parse(`${date}T12:00:00Z`), tz);

  const recurring = rows<Recurring>(
    `SELECT * FROM recurring_schedules
     WHERE doctor_id = ? AND day_of_week = ? AND status = 'ACTIVE'
       AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)`,
    doctorId,
    dow,
    date,
    date
  );

  const exceptions = rows<Exception>(
    "SELECT id, type, start_time, end_time FROM schedule_exceptions WHERE doctor_id = ? AND date = ?",
    doctorId,
    date
  );

  if (exceptions.some((e) => e.type === "LEAVE")) {
    return { ok: true, slots: [], date };
  }

  // Base windows from the recurring template...
  let windows: Array<{ start: string; end: string }> = recurring.map((r) => ({
    start: r.start_time.slice(0, 5),
    end: r.end_time.slice(0, 5),
  }));

  // ...replaced by CUSTOM_HOURS if present.
  const custom = exceptions.filter((e) => e.type === "CUSTOM_HOURS" && e.start_time && e.end_time);
  if (custom.length > 0) {
    windows = custom.map((e) => ({ start: e.start_time!.slice(0, 5), end: e.end_time!.slice(0, 5) }));
  }

  // EXTRA_HOURS append additional windows.
  for (const e of exceptions) {
    if (e.type === "EXTRA_HOURS" && e.start_time && e.end_time) {
      windows.push({ start: e.start_time.slice(0, 5), end: e.end_time.slice(0, 5) });
    }
  }

  const blocks = exceptions
    .filter((e) => e.type === "BLOCK" && e.start_time && e.end_time)
    .map((e) => ({ start: e.start_time!.slice(0, 5), end: e.end_time!.slice(0, 5) }));

  const duration =
    slotDurationMinutes ??
    recurring.find((r) => r.slot_duration_minutes)?.slot_duration_minutes ??
    20;

  const minStartMs = Date.now() + settings.booking.minAdvanceMinutes * 60 * 1000;

  // Active (non-expired) appointments occupying slots.
  const now = nowIso();
  const occupied = new Set(
    rows<{ start_at: string }>(
      `SELECT start_at FROM appointments
       WHERE doctor_id = ? AND start_at >= ? AND start_at < ?
         AND status IN ('HELD','BOOKED','CONFIRMED','CHECKED_IN','WAITING','IN_CONSULTATION')
         AND (status != 'HELD' OR hold_expires_at IS NULL OR hold_expires_at > ?)`,
      doctorId,
      zonedTimeToUtc(date, "00:00", tz),
      zonedTimeToUtc(addDays(date, 1), "00:00", tz),
      now
    ).map((r) => r.start_at)
  );

  const slots: Slot[] = [];
  for (const w of windows) {
    const wStart = timeToMinutes(w.start);
    const wEnd = timeToMinutes(w.end);
    for (let t = wStart; t + duration <= wEnd; t += duration) {
      const s = minutesToTime(t);
      const e = minutesToTime(t + duration);
      const startAt = zonedTimeToUtc(date, s, tz);
      const startMs = Date.parse(startAt);
      // Past slots (and slots inside the minimum advance window) are excluded.
      if (startMs < minStartMs) continue;
      let status: SlotStatus = "AVAILABLE";
      if (blocks.some((b) => overlaps(s, e, b.start, b.end))) status = "BLOCKED";
      else if (occupied.has(startAt)) status = "BOOKED";
      slots.push({ startAt, endAt: zonedTimeToUtc(date, e, tz), status });
    }
  }

  slots.sort((a, b) => (a.startAt < b.startAt ? -1 : 1));
  return { ok: true, slots, date };
}
