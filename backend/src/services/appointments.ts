import { randomUUID } from "crypto";
import { db, row, rows } from "../db";
import { nowIso } from "../lib/time";

export interface AppointmentRow {
  id: string;
  appointment_number: string;
  clinic_id: string;
  doctor_id: string;
  patient_id: string;
  service_id: string;
  start_at: string;
  end_at: string;
  status: string;
  booking_source: string;
  booking_created_by: string | null;
  idempotency_key: string | null;
  hold_expires_at: string | null;
  rescheduled_from_appointment_id: string | null;
  notes_for_clinic: string | null;
  cancellation_reason: string | null;
  cancelled_at: string | null;
  checked_in_at: string | null;
  consultation_started_at: string | null;
  consultation_completed_at: string | null;
  follow_up_required: number;
  follow_up_notes: string | null;
  created_at: string;
  updated_at: string;
}

const APPT_TRANSITIONS: Record<string, string[]> = {
  HELD: ["BOOKED", "CONFIRMED", "EXPIRED", "CANCELLED"],
  BOOKED: ["CONFIRMED", "CHECKED_IN", "CANCELLED", "RESCHEDULED", "NO_SHOW"],
  CONFIRMED: ["CHECKED_IN", "CANCELLED", "RESCHEDULED", "NO_SHOW"],
  CHECKED_IN: ["WAITING", "IN_CONSULTATION", "CANCELLED", "NO_SHOW", "COMPLETED"],
  WAITING: ["IN_CONSULTATION", "CANCELLED", "NO_SHOW"],
  IN_CONSULTATION: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
  RESCHEDULED: [],
  NO_SHOW: [],
  EXPIRED: [],
};

export function canTransition(from: string, to: string): boolean {
  return (APPT_TRANSITIONS[from] ?? []).includes(to);
}

/** Next appointment number for a clinic on a UTC date, inside a transaction. */
export function nextAppointmentNumber(clinicId: string): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const counter = row<{ last_number: number }>(
    "SELECT last_number FROM appointment_counters WHERE clinic_id = ? AND date = ?",
    clinicId,
    date
  );
  const next = (counter?.last_number ?? 0) + 1;
  db.prepare(
    `INSERT INTO appointment_counters (clinic_id, date, last_number)
     VALUES (?, ?, ?)
     ON CONFLICT (clinic_id, date) DO UPDATE SET last_number = excluded.last_number`
  ).run(clinicId, date, next);
  return `APT-${date}-${String(next).padStart(4, "0")}`;
}

export function getAppointment(id: string): AppointmentRow | undefined {
  return row<AppointmentRow>("SELECT * FROM appointments WHERE id = ?", id);
}

export function shapeAppointment(appt: AppointmentRow) {
  const doctor = row<{ id: string; name: string; specialty: string }>(
    "SELECT id, name, specialty FROM doctors WHERE id = ?",
    appt.doctor_id
  );
  const patient = row<{ id: string; full_name: string; phone: string | null }>(
    "SELECT id, full_name, phone FROM patient_profiles WHERE id = ?",
    appt.patient_id
  );
  const service = row<{ id: string; name: string; duration_minutes: number; fee: number | null }>(
    "SELECT id, name, duration_minutes, fee FROM services WHERE id = ?",
    appt.service_id
  );
  const payment = row<{ id: string; amount: number; currency: string; status: string; method: string | null }>(
    "SELECT id, amount, currency, status, method FROM payments WHERE appointment_id = ? ORDER BY created_at DESC LIMIT 1",
    appt.id
  );
  const queueTicket = row<{ id: string; token_number: number; status: string; position: number }>(
    `SELECT id, token_number, status, position FROM queue_tickets
     WHERE appointment_id = ? ORDER BY created_at DESC LIMIT 1`,
    appt.id
  );
  return {
    id: appt.id,
    appointmentNumber: appt.appointment_number,
    clinicId: appt.clinic_id,
    doctorId: appt.doctor_id,
    patientId: appt.patient_id,
    serviceId: appt.service_id,
    startAt: appt.start_at,
    endAt: appt.end_at,
    status: appt.status,
    bookingSource: appt.booking_source,
    tokenNumber: queueTicket?.token_number ?? null,
    notesForClinic: appt.notes_for_clinic,
    cancellationReason: appt.cancellation_reason,
    paymentStatus: payment?.status ?? null,
    rescheduledFromAppointmentId: appt.rescheduled_from_appointment_id,
    followUpRequired: appt.follow_up_required === 1,
    followUpNotes: appt.follow_up_notes,
    doctor: doctor ? { id: doctor.id, name: doctor.name, specialty: doctor.specialty } : null,
    patient: patient ? { id: patient.id, fullName: patient.full_name, phone: patient.phone } : null,
    service: service
      ? { id: service.id, name: service.name, durationMinutes: service.duration_minutes, fee: service.fee }
      : null,
    queueTicket: queueTicket
      ? { id: queueTicket.id, tokenNumber: queueTicket.token_number, status: queueTicket.status, position: queueTicket.position }
      : null,
    payment: payment
      ? { id: payment.id, amount: payment.amount, currency: payment.currency, status: payment.status, method: payment.method }
      : null,
  };
}

/** Patient profile ids the caller may book for (self + family). */
export function callerPatientIds(userId: string): string[] {
  return rows<{ id: string }>("SELECT id FROM patient_profiles WHERE user_id = ?", userId).map(
    (r) => r.id
  );
}

/** Find an active queue ticket for an appointment. */
export function activeTicketForAppointment(appointmentId: string) {
  return row<{ id: string; status: string }>(
    `SELECT id, status FROM queue_tickets WHERE appointment_id = ?
     AND status IN ('WAITING','CALLED','IN_CONSULTATION') ORDER BY created_at DESC LIMIT 1`,
    appointmentId
  );
}

export function newId(): string {
  return randomUUID();
}

export { nowIso };
