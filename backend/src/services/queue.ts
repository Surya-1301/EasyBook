import { db, row, rows } from "../db";
import { ACTIVE_QUEUE_STATUSES } from "../types";
import { localDate, nowIso } from "../lib/time";
import { isSqliteUniqueViolation } from "../lib/http";
import { newId } from "./appointments";

export interface TicketRow {
  id: string;
  clinic_id: string;
  doctor_id: string;
  appointment_id: string | null;
  patient_id: string;
  visit_date: string;
  token_number: number;
  status: string;
  position: number;
  estimated_wait_minutes: number | null;
  checked_in_at: string;
  called_at: string | null;
  consultation_started_at: string | null;
  consultation_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

const TICKET_TRANSITIONS: Record<string, string[]> = {
  WAITING: ["CALLED", "IN_CONSULTATION", "SKIPPED", "CANCELLED", "NO_SHOW"],
  CALLED: ["IN_CONSULTATION", "WAITING", "SKIPPED", "CANCELLED", "NO_SHOW"],
  IN_CONSULTATION: ["COMPLETED", "CANCELLED"],
  SKIPPED: ["WAITING", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export function canTicketTransition(from: string, to: string): boolean {
  return (TICKET_TRANSITIONS[from] ?? []).includes(to);
}

/** Average slot duration (minutes) for a doctor — service-weighted, fallback 20. */
export function avgSlotDuration(doctorId: string): number {
  const r = row<{ avg: number | null }>(
    `SELECT AVG(s.duration_minutes) AS avg
     FROM appointments a JOIN services s ON s.id = a.service_id
     WHERE a.doctor_id = ? AND a.status NOT IN ('CANCELLED','EXPIRED','RESCHEDULED','NO_SHOW')`,
    doctorId
  );
  return Math.round(r?.avg ?? 20) || 20;
}

export function doctorDelayMinutes(doctorId: string, date: string): number {
  const r = row<{ delay_minutes: number }>(
    "SELECT delay_minutes FROM doctor_delays WHERE doctor_id = ? AND date = ?",
    doctorId,
    date
  );
  return r?.delay_minutes ?? 0;
}

/** Next token number for (clinic, doctor, date). Call inside a transaction; retries on race. */
export function nextTokenNumber(clinicId: string, doctorId: string, visitDate: string): number {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const r = row<{ m: number | null }>(
        "SELECT MAX(token_number) AS m FROM queue_tickets WHERE clinic_id = ? AND doctor_id = ? AND visit_date = ?",
        clinicId,
        doctorId,
        visitDate
      );
      const next = (r?.m ?? 0) + 1;
      // Reserve the number with a placeholder-safe insert check via the unique index.
      // We rely on the INSERT below (in createTicket) to enforce uniqueness.
      return next;
    } catch (err) {
      if (!isSqliteUniqueViolation(err)) throw err;
    }
  }
  throw new Error("Could not allocate queue token");
}

export function createTicket(input: {
  clinicId: string;
  doctorId: string;
  appointmentId?: string | null;
  patientId: string;
  visitDate: string;
  status?: string;
}): TicketRow {
  const now = nowIso();
  for (let attempt = 0; attempt < 5; attempt++) {
    const token = nextTokenNumber(input.clinicId, input.doctorId, input.visitDate);
    const posRow = row<{ m: number | null }>(
      `SELECT MAX(position) AS m FROM queue_tickets
       WHERE clinic_id = ? AND doctor_id = ? AND visit_date = ?
         AND status IN (${ACTIVE_QUEUE_STATUSES.map((s) => `'${s}'`).join(",")})`,
      input.clinicId,
      input.doctorId,
      input.visitDate
    );
    const id = newId();
    try {
      db.prepare(
        `INSERT INTO queue_tickets
           (id, clinic_id, doctor_id, appointment_id, patient_id, visit_date, token_number,
            status, position, checked_in_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        input.clinicId,
        input.doctorId,
        input.appointmentId ?? null,
        input.patientId,
        input.visitDate,
        token,
        input.status ?? "WAITING",
        (posRow?.m ?? 0) + 1,
        now,
        now,
        now
      );
      return row<TicketRow>("SELECT * FROM queue_tickets WHERE id = ?", id)!;
    } catch (err) {
      if (!isSqliteUniqueViolation(err)) throw err;
      // Token race — retry.
    }
  }
  throw new Error("Could not create queue ticket");
}

export function getTicket(id: string): TicketRow | undefined {
  return row<TicketRow>("SELECT * FROM queue_tickets WHERE id = ?", id);
}

function shapeTicketPatient(patientId: string) {
  const p = row<{ id: string; full_name: string; phone: string | null }>(
    "SELECT id, full_name, phone FROM patient_profiles WHERE id = ?",
    patientId
  );
  return p ? { id: p.id, fullName: p.full_name, phone: p.phone } : null;
}

function shapeTicketAppt(appointmentId: string | null) {
  if (!appointmentId) return null;
  const a = row<{ id: string; start_at: string; status: string }>(
    "SELECT id, start_at, status FROM appointments WHERE id = ?",
    appointmentId
  );
  return a ? { id: a.id, startAt: a.start_at, status: a.status } : null;
}

/**
 * Full queue view for a doctor on a date: ordered tickets with live
 * estimated waits, currently-serving ticket and stats.
 */
export function queueView(clinicId: string, doctorId: string, visitDate: string) {
  const tickets = rows<TicketRow>(
    `SELECT * FROM queue_tickets
     WHERE clinic_id = ? AND doctor_id = ? AND visit_date = ?
     ORDER BY position ASC, token_number ASC`,
    clinicId,
    doctorId,
    visitDate
  );
  const delay = doctorDelayMinutes(doctorId, visitDate);
  const avg = avgSlotDuration(doctorId);

  const active = tickets.filter((t) => (ACTIVE_QUEUE_STATUSES as readonly string[]).includes(t.status));
  const shaped = tickets.map((t, idx) => {
    const ahead = active.filter(
      (o) => o.id !== t.id && o.position < t.position && ["WAITING", "CALLED"].includes(o.status)
    ).length;
    const estimated =
      (ACTIVE_QUEUE_STATUSES as readonly string[]).includes(t.status) ? ahead * avg + delay : 0;
    const appt = shapeTicketAppt(t.appointment_id);
    return {
      id: t.id,
      tokenNumber: t.token_number,
      status: t.status,
      position: idx + 1,
      estimatedWaitMinutes: estimated,
      patient: shapeTicketPatient(t.patient_id),
      appointmentId: t.appointment_id,
      appointmentTime: appt?.startAt ?? null,
      checkedInAt: t.checked_in_at,
      calledAt: t.called_at,
    };
  });

  const currentlyServing =
    shaped.find((t) => t.status === "IN_CONSULTATION") ??
    shaped.find((t) => t.status === "CALLED") ??
    null;

  const count = (s: string) => tickets.filter((t) => t.status === s).length;
  return {
    queue: shaped,
    currentlyServing,
    stats: {
      total: tickets.length,
      waiting: count("WAITING"),
      called: count("CALLED"),
      inConsultation: count("IN_CONSULTATION"),
      completed: count("COMPLETED"),
      skipped: count("SKIPPED"),
      cancelled: count("CANCELLED"),
      noShow: count("NO_SHOW"),
      doctorDelayMinutes: delay,
      avgSlotMinutes: avg,
    },
  };
}

/** Today's clinic-local date for queue scoping. */
export function todayLocal(tz: string): string {
  return localDate(Date.now(), tz);
}

/** Renumber positions for a day's queue after reorder/skip (1..n in current order). */
export function renumberPositions(clinicId: string, doctorId: string, visitDate: string): void {
  const tickets = rows<{ id: string }>(
    `SELECT id FROM queue_tickets
     WHERE clinic_id = ? AND doctor_id = ? AND visit_date = ?
     ORDER BY position ASC, token_number ASC`,
    clinicId,
    doctorId,
    visitDate
  );
  const now = nowIso();
  const stmt = db.prepare("UPDATE queue_tickets SET position = ?, updated_at = ? WHERE id = ?");
  tickets.forEach((t, i) => stmt.run(i + 1, now, t.id));
}

/** Move a ticket to a new 1-based position among the day's tickets. */
export function moveTicketToPosition(ticketId: string, newPosition: number): void {
  const t = getTicket(ticketId);
  if (!t) throw new Error("NOT_FOUND");
  const tickets = rows<{ id: string }>(
    `SELECT id FROM queue_tickets
     WHERE clinic_id = ? AND doctor_id = ? AND visit_date = ? AND id != ?
     ORDER BY position ASC, token_number ASC`,
    t.clinic_id,
    t.doctor_id,
    t.visit_date,
    ticketId
  );
  const clamped = Math.max(1, Math.min(newPosition, tickets.length + 1));
  const ids = tickets.map((x) => x.id);
  ids.splice(clamped - 1, 0, ticketId);
  const now = nowIso();
  const stmt = db.prepare("UPDATE queue_tickets SET position = ?, updated_at = ? WHERE id = ?");
  ids.forEach((id, i) => stmt.run(i + 1, now, id));
}
