import { randomUUID } from "crypto";
import { db } from "../db";
import { nowIso } from "../lib/time";

// V1: notifications are persisted as rows (status QUEUED) and logged to the
// console. A real SMS provider can be plugged in behind queueNotification.

export interface NotificationInput {
  clinicId: string;
  patientId?: string | null;
  appointmentId?: string | null;
  templateKey: string;
  destination: string;
  vars?: Record<string, string | number>;
}

const TEMPLATES: Record<string, (v: Record<string, string | number>) => string> = {
  appointment_confirmed: (v) =>
    `Appointment confirmed with Dr. ${v.doctorName} on ${v.date} at ${v.time}. Token info will be shared at check-in.`,
  appointment_cancelled: (v) =>
    `Your appointment with Dr. ${v.doctorName} on ${v.date} at ${v.time} has been cancelled.`,
  appointment_rescheduled: (v) =>
    `Your appointment has been changed to ${v.date} at ${v.time} with Dr. ${v.doctorName}.`,
  appointment_reminder: (v) => `Reminder: You have an appointment with Dr. ${v.doctorName} today at ${v.time}.`,
  checked_in: (v) => `You are checked in. Your token is #${v.token}. ${v.patientsBefore} patient(s) before you. Estimated wait: ${v.wait} min.`,
  doctor_delay: (v) =>
    `The doctor is running approximately ${v.delay} minutes late. Your appointment remains confirmed.`,
  queue_update: (v) => `There are ${v.count} patients before you. Estimated wait: ${v.minutes} minutes.`,
};

export function renderTemplate(templateKey: string, vars: Record<string, string | number> = {}): string {
  const fn = TEMPLATES[templateKey];
  return fn ? fn(vars) : templateKey;
}

export function queueNotification(input: NotificationInput): void {
  const now = nowIso();
  db.prepare(
    `INSERT INTO notifications
       (id, clinic_id, patient_id, appointment_id, channel, template_key, destination, status, created_at)
     VALUES (?, ?, ?, ?, 'SMS', ?, ?, 'QUEUED', ?)`
  ).run(
    randomUUID(),
    input.clinicId,
    input.patientId ?? null,
    input.appointmentId ?? null,
    input.templateKey,
    input.destination,
    now
  );
  const body = renderTemplate(input.templateKey, input.vars ?? {});
  console.log(`[notifications] SMS -> ${input.destination} [${input.templateKey}]: ${body}`);
}
