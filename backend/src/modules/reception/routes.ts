import { randomUUID } from "crypto";
import { Router } from "express";
import { z } from "zod";
import { db, row, rows } from "../../db";
import { ah, fail, isSqliteUniqueViolation, ok, zodFieldErrors } from "../../lib/http";
import { addDays, localDate, nowIso, zonedTimeToUtc } from "../../lib/time";
import { requireAuth, requireStaff } from "../../middleware/auth";
import { mergeSettings } from "../../types";
import { generateAvailability } from "../../services/availability";
import { audit } from "../../services/audit";
import { queueNotification } from "../../services/notifications";
import {
  canTransition,
  getAppointment,
  newId,
  nextAppointmentNumber,
  shapeAppointment,
  type AppointmentRow,
} from "../../services/appointments";
import { createTicket, queueView, todayLocal } from "../../services/queue";

const router = Router();
router.use(requireAuth, requireStaff);

function staffClinic(req: { user?: { clinicId: string | null } }): string {
  const c = req.user?.clinicId;
  if (!c) throw Object.assign(new Error("no clinic"), { httpCode: 403, errorCode: "FORBIDDEN" });
  return c;
}

function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  if (phone.length <= 4) return "xxxx";
  return `${phone.slice(0, 2)}${"x".repeat(phone.length - 4)}${phone.slice(-2)}`;
}

// --- GET /reception/today ---------------------------------------------------------
router.get(
  "/today",
  ah(async (req, res) => {
    const clinicId = staffClinic(req);
    const tz = row<{ timezone: string }>("SELECT timezone FROM clinics WHERE id = ?", clinicId)?.timezone ?? "Asia/Kolkata";
    const date = (req.query.date as string | undefined) ?? todayLocal(tz);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return fail(res, 400, "VALIDATION_ERROR", "Invalid date.", { date: "Use format YYYY-MM-DD." });
    }

    const list = rows<AppointmentRow>(
      `SELECT a.* FROM appointments a
       JOIN doctors d ON d.id = a.doctor_id
       WHERE d.clinic_id = ? AND a.start_at >= ? AND a.start_at < ?
         AND a.status != 'EXPIRED'
       ORDER BY a.start_at ASC`,
      clinicId,
      zonedTimeToUtc(addDays(date, -1), "00:00", tz),
      zonedTimeToUtc(addDays(date, 2), "00:00", tz)
    ).filter((a) => localDate(Date.parse(a.start_at), tz) === date);

    const appointments = list.map((a) => {
      const shaped = shapeAppointment(a);
      const ticket = a.id
        ? row<{ status: string; token_number: number }>(
            "SELECT status, token_number FROM queue_tickets WHERE appointment_id = ? ORDER BY created_at DESC LIMIT 1",
            a.id
          )
        : null;
      return { ...shaped, queueStatus: ticket?.status ?? null, tokenNumber: ticket?.token_number ?? shaped.tokenNumber };
    });

    const walkIns = rows<{
      id: string;
      token_number: number;
      status: string;
      patient_id: string;
      doctor_id: string;
      checked_in_at: string;
    }>(
      `SELECT id, token_number, status, patient_id, doctor_id, checked_in_at FROM queue_tickets
       WHERE clinic_id = ? AND visit_date = ? AND appointment_id IS NULL
       ORDER BY token_number ASC`,
      clinicId,
      date
    ).map((t) => {
      const patient = row<{ id: string; full_name: string; phone: string | null }>(
        "SELECT id, full_name, phone FROM patient_profiles WHERE id = ?",
        t.patient_id
      );
      const doctor = row<{ id: string; name: string }>("SELECT id, name FROM doctors WHERE id = ?", t.doctor_id);
      return {
        id: t.id,
        isWalkIn: true,
        tokenNumber: t.token_number,
        queueStatus: t.status,
        checkedInAt: t.checked_in_at,
        patient: patient ? { id: patient.id, fullName: patient.full_name, phone: patient.phone } : null,
        doctor: doctor ? { id: doctor.id, name: doctor.name } : null,
      };
    });

    const count = (pred: (a: AppointmentRow) => boolean) => list.filter(pred).length;
    return ok(res, 200, {
      date,
      stats: {
        total: list.length,
        checkedIn: count((a) => a.status === "CHECKED_IN"),
        waiting: count((a) => a.status === "WAITING"),
        completed: count((a) => a.status === "COMPLETED"),
        cancelled: count((a) => a.status === "CANCELLED"),
        noShow: count((a) => a.status === "NO_SHOW"),
        walkIns: walkIns.length,
      },
      appointments,
      walkIns,
    });
  })
);

// --- Patient helpers ----------------------------------------------------------------
function findOrCreatePatient(input: {
  fullName: string;
  phone: string;
  dateOfBirth?: string;
  gender?: string;
}): { id: string; duplicateWarning?: string } {
  const existing = row<{ id: string; full_name: string }>(
    "SELECT id, full_name FROM patient_profiles WHERE phone = ? ORDER BY created_at ASC LIMIT 1",
    input.phone
  );
  if (existing) return { id: existing.id, duplicateWarning: `Existing patient found: ${existing.full_name} (${maskPhone(input.phone)})` };
  const now = nowIso();
  const id = newId();
  db.prepare(
    `INSERT INTO patient_profiles (id, full_name, phone, date_of_birth, gender, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, input.fullName, input.phone, input.dateOfBirth ?? null, input.gender ?? null, now, now);
  return { id };
}

function getDoctorInClinic(doctorId: string, clinicId: string) {
  return row<{ id: string; clinic_id: string; name: string; status: string }>(
    "SELECT id, clinic_id, name, status FROM doctors WHERE id = ? AND clinic_id = ?",
    doctorId,
    clinicId
  );
}

function getServiceInClinic(serviceId: string, clinicId: string) {
  return row<{ id: string; name: string; duration_minutes: number; fee: number | null; status: string }>(
    "SELECT id, name, duration_minutes, fee, status FROM services WHERE id = ? AND clinic_id = ?",
    serviceId,
    clinicId
  );
}

function createPayment(appointmentId: string, amount: number, status: string, now: string): void {
  db.prepare(
    `INSERT INTO payments (id, appointment_id, amount, currency, status, created_at, updated_at)
     VALUES (?, ?, ?, 'INR', ?, ?, ?)`
  ).run(newId(), appointmentId, amount, status, now, now);
}

const receptionBookingSchema = z.object({
  patientId: z.string().uuid().optional(),
  newPatient: z
    .object({
      fullName: z.string().min(1).max(120),
      phone: z.string().min(10).max(15),
      dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      gender: z.string().max(20).optional(),
    })
    .optional(),
  doctorId: z.string().uuid(),
  serviceId: z.string().uuid(),
  startAt: z.string().datetime({ offset: true }),
  bookingSource: z.enum(["PHONE", "RECEPTION"]).default("RECEPTION"),
  paymentStatus: z.enum(["PENDING", "PAID", "PAY_AT_CLINIC", "NOT_REQUIRED"]).optional(),
  notesForClinic: z.string().max(1000).optional(),
});

// --- POST /reception/appointments ----------------------------------------------------
router.post(
  "/appointments",
  ah(async (req, res) => {
    const parsed = receptionBookingSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid request.", zodFieldErrors(parsed.error));
    const u = req.user!;
    const clinicId = staffClinic(req);
    const b = parsed.data;

    if (!b.patientId && !b.newPatient) {
      return fail(res, 400, "VALIDATION_ERROR", "Provide patientId or newPatient.", { patientId: "Required." });
    }
    const doctor = getDoctorInClinic(b.doctorId, clinicId);
    if (!doctor || doctor.status !== "ACTIVE") return fail(res, 404, "DOCTOR_NOT_AVAILABLE", "Doctor is not available.");
    const service = getServiceInClinic(b.serviceId, clinicId);
    if (!service || service.status !== "ACTIVE") return fail(res, 404, "NOT_FOUND", "Service not found.");

    let patientId = b.patientId ?? "";
    let duplicateWarning: string | undefined;
    if (b.newPatient) {
      const r = findOrCreatePatient(b.newPatient);
      patientId = r.id;
      duplicateWarning = r.duplicateWarning;
    } else {
      const exists = row("SELECT id FROM patient_profiles WHERE id = ?", patientId);
      if (!exists) return fail(res, 404, "PATIENT_NOT_FOUND", "Patient not found.");
    }

    // Validate slot against the availability engine.
    const ms = Date.parse(b.startAt);
    if (Number.isNaN(ms)) return fail(res, 400, "VALIDATION_ERROR", "Invalid startAt.");
    const tz = row<{ timezone: string }>("SELECT timezone FROM clinics WHERE id = ?", clinicId)?.timezone ?? "Asia/Kolkata";
    const date = localDate(ms, tz);
    const avail = generateAvailability(b.doctorId, date, service.duration_minutes);
    if (!avail.ok) return fail(res, 400, "DOCTOR_NOT_AVAILABLE", "Doctor is not available on the selected date.");
    const slot = avail.slots.find((s) => s.startAt === b.startAt && s.status === "AVAILABLE");
    if (!slot) return fail(res, 409, "SLOT_UNAVAILABLE", "This appointment time is no longer available.");

    const settings = mergeSettings(row<{ settings: string | null }>("SELECT settings FROM clinics WHERE id = ?", clinicId)?.settings ?? null);
    const status = settings.booking.autoConfirm ? "CONFIRMED" : "BOOKED";
    const now = nowIso();
    const id = newId();
    try {
      const tx = db.transaction(() => {
        db.prepare(
          `INSERT INTO appointments
             (id, appointment_number, clinic_id, doctor_id, patient_id, service_id, start_at, end_at,
              status, booking_source, booking_created_by, notes_for_clinic, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          id,
          nextAppointmentNumber(clinicId),
          clinicId,
          b.doctorId,
          patientId,
          b.serviceId,
          slot.startAt,
          slot.endAt,
          status,
          b.bookingSource,
          u.id,
          b.notesForClinic ?? null,
          now,
          now
        );
        createPayment(id, service.fee ?? 0, b.paymentStatus ?? (status === "CONFIRMED" ? "PAY_AT_CLINIC" : "PENDING"), now);
      });
      tx();
    } catch (err) {
      if (isSqliteUniqueViolation(err)) {
        return fail(res, 409, "SLOT_UNAVAILABLE", "This appointment time is no longer available.");
      }
      throw err;
    }

    const appt = getAppointment(id)!;
    audit({
      clinicId,
      actorUserId: u.id,
      entityType: "appointment",
      entityId: id,
      action: "APPOINTMENT_CREATED",
      newValues: { status, startAt: slot.startAt, bookingSource: b.bookingSource },
      req,
    });
    const patient = row<{ phone: string | null }>("SELECT phone FROM patient_profiles WHERE id = ?", patientId);
    queueNotification({
      clinicId,
      patientId,
      appointmentId: id,
      templateKey: "appointment_confirmed",
      destination: patient?.phone ?? "",
      vars: {
        doctorName: doctor.name.replace(/^Dr\.\s*/, ""),
        date,
        time: new Date(slot.startAt).toLocaleTimeString("en-IN", { timeZone: tz, hour: "numeric", minute: "2-digit" }),
      },
    });
    return ok(res, 201, { appointment: shapeAppointment(appt), ...(duplicateWarning ? { duplicateWarning } : {}) });
  })
);

const walkInSchema = z.object({
  patientId: z.string().uuid().optional(),
  newPatient: z
    .object({
      fullName: z.string().min(1).max(120),
      phone: z.string().min(10).max(15),
      dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      gender: z.string().max(20).optional(),
    })
    .optional(),
  doctorId: z.string().uuid(),
  serviceId: z.string().uuid().optional(),
});

// --- POST /reception/walk-ins -----------------------------------------------------------
router.post(
  "/walk-ins",
  ah(async (req, res) => {
    const parsed = walkInSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid request.", zodFieldErrors(parsed.error));
    const u = req.user!;
    const clinicId = staffClinic(req);
    const b = parsed.data;

    if (!b.patientId && !b.newPatient) {
      return fail(res, 400, "VALIDATION_ERROR", "Provide patientId or newPatient.", { patientId: "Required." });
    }
    const doctor = getDoctorInClinic(b.doctorId, clinicId);
    if (!doctor || doctor.status !== "ACTIVE") return fail(res, 404, "DOCTOR_NOT_AVAILABLE", "Doctor is not available.");
    if (b.serviceId) {
      const svc = getServiceInClinic(b.serviceId, clinicId);
      if (!svc) return fail(res, 404, "NOT_FOUND", "Service not found.");
    }

    let patientId = b.patientId ?? "";
    let duplicateWarning: string | undefined;
    if (b.newPatient) {
      const r = findOrCreatePatient(b.newPatient);
      patientId = r.id;
      duplicateWarning = r.duplicateWarning;
    } else {
      const exists = row("SELECT id FROM patient_profiles WHERE id = ?", patientId);
      if (!exists) return fail(res, 404, "PATIENT_NOT_FOUND", "Patient not found.");
    }

    const tz = row<{ timezone: string }>("SELECT timezone FROM clinics WHERE id = ?", clinicId)?.timezone ?? "Asia/Kolkata";
    const visitDate = todayLocal(tz);
    const ticket = createTicket({ clinicId, doctorId: b.doctorId, appointmentId: null, patientId, visitDate });

    audit({
      clinicId,
      actorUserId: u.id,
      entityType: "queue_ticket",
      entityId: ticket.id,
      action: "WALK_IN_CREATED",
      newValues: { tokenNumber: ticket.token_number, doctorId: b.doctorId, patientId },
      req,
    });
    return ok(res, 201, {
      queueTicket: {
        id: ticket.id,
        tokenNumber: ticket.token_number,
        status: ticket.status,
        position: ticket.position,
        estimatedWaitMinutes: 0,
      },
      ...(duplicateWarning ? { duplicateWarning } : {}),
    });
  })
);

// --- Shared appointment transition for staff ------------------------------------------
function staffGetAppointment(id: string, clinicId: string): AppointmentRow | undefined {
  const appt = getAppointment(id);
  if (!appt || appt.clinic_id !== clinicId) return undefined;
  return appt;
}

function terminalError(res: Parameters<Parameters<typeof ah>[0]>[1], appt: AppointmentRow): boolean {
  if (appt.status === "CANCELLED") {
    fail(res, 409, "APPOINTMENT_ALREADY_CANCELLED", "This appointment is already cancelled.");
    return true;
  }
  if (["COMPLETED", "NO_SHOW", "EXPIRED", "RESCHEDULED"].includes(appt.status)) {
    fail(res, 409, "APPOINTMENT_ALREADY_COMPLETED", "This appointment can no longer be modified.");
    return true;
  }
  return false;
}

// --- POST /reception/appointments/:id/check-in ------------------------------------------
router.post(
  "/appointments/:id/check-in",
  ah(async (req, res) => {
    const u = req.user!;
    const clinicId = staffClinic(req);
    const appt = staffGetAppointment(req.params.id, clinicId);
    if (!appt) return fail(res, 404, "NOT_FOUND", "Appointment not found.");
    if (!["BOOKED", "CONFIRMED"].includes(appt.status)) {
      return fail(res, 400, "VALIDATION_ERROR", "Only upcoming appointments can be checked in.");
    }
    const tz = row<{ timezone: string }>("SELECT timezone FROM clinics WHERE id = ?", clinicId)?.timezone ?? "Asia/Kolkata";
    const visitDate = todayLocal(tz);
    const now = nowIso();

    try {
      db.transaction(() => {
        const existing = row("SELECT id FROM queue_tickets WHERE appointment_id = ? AND status IN ('WAITING','CALLED','IN_CONSULTATION')", appt.id);
        if (existing) throw Object.assign(new Error("already checked in"), { code: "ALREADY" });
        db.prepare("UPDATE appointments SET status = 'CHECKED_IN', checked_in_at = ?, updated_at = ? WHERE id = ?").run(now, now, appt.id);
      })();
    } catch (err) {
      if ((err as { code?: string }).code === "ALREADY") {
        return fail(res, 400, "VALIDATION_ERROR", "Already checked in.");
      }
      throw err;
    }

    const ticket = createTicket({ clinicId, doctorId: appt.doctor_id, appointmentId: appt.id, patientId: appt.patient_id, visitDate });
    const view = queueView(clinicId, appt.doctor_id, visitDate);
    const mine = view.queue.find((t) => t.id === ticket.id);

    audit({
      clinicId,
      actorUserId: u.id,
      entityType: "appointment",
      entityId: appt.id,
      action: "APPOINTMENT_CHECKED_IN",
      oldValues: { status: appt.status },
      newValues: { status: "CHECKED_IN", tokenNumber: ticket.token_number },
      req,
    });
    const updated = getAppointment(appt.id)!;
    return ok(res, 200, {
      appointment: shapeAppointment(updated),
      queueTicket: {
        id: ticket.id,
        tokenNumber: ticket.token_number,
        status: ticket.status,
        position: mine?.position ?? ticket.position,
        estimatedWaitMinutes: mine?.estimatedWaitMinutes ?? 0,
      },
    });
  })
);

// --- POST /reception/appointments/:id/no-show ---------------------------------------------
router.post(
  "/appointments/:id/no-show",
  ah(async (req, res) => {
    const u = req.user!;
    const clinicId = staffClinic(req);
    const appt = staffGetAppointment(req.params.id, clinicId);
    if (!appt) return fail(res, 404, "NOT_FOUND", "Appointment not found.");
    if (terminalError(res, appt)) return;
    if (!canTransition(appt.status, "NO_SHOW")) {
      return fail(res, 400, "VALIDATION_ERROR", `Cannot mark ${appt.status} as no-show.`);
    }
    const now = nowIso();
    db.transaction(() => {
      db.prepare("UPDATE appointments SET status = 'NO_SHOW', updated_at = ? WHERE id = ?").run(now, appt.id);
      db.prepare("UPDATE queue_tickets SET status = 'NO_SHOW', updated_at = ? WHERE appointment_id = ? AND status IN ('WAITING','CALLED')").run(now, appt.id);
    })();
    audit({
      clinicId,
      actorUserId: u.id,
      entityType: "appointment",
      entityId: appt.id,
      action: "APPOINTMENT_NO_SHOW",
      oldValues: { status: appt.status },
      newValues: { status: "NO_SHOW", markedBy: u.id, markedAt: now },
      req,
    });
    return ok(res, 200, { appointment: shapeAppointment(getAppointment(appt.id)!) });
  })
);

const staffCancelSchema = z.object({ reason: z.string().max(500).optional() });

// --- POST /reception/appointments/:id/cancel ------------------------------------------------
router.post(
  "/appointments/:id/cancel",
  ah(async (req, res) => {
    const parsed = staffCancelSchema.safeParse(req.body ?? {});
    if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid request.", zodFieldErrors(parsed.error));
    const u = req.user!;
    const clinicId = staffClinic(req);
    const appt = staffGetAppointment(req.params.id, clinicId);
    if (!appt) return fail(res, 404, "NOT_FOUND", "Appointment not found.");
    if (terminalError(res, appt)) return;

    const now = nowIso();
    const target = appt.status === "HELD" ? "EXPIRED" : "CANCELLED";
    db.transaction(() => {
      db.prepare(
        "UPDATE appointments SET status = ?, cancellation_reason = ?, cancelled_at = ?, hold_expires_at = NULL, updated_at = ? WHERE id = ?"
      ).run(target, parsed.data.reason ?? null, now, now, appt.id);
      db.prepare("UPDATE queue_tickets SET status = 'CANCELLED', updated_at = ? WHERE appointment_id = ? AND status IN ('WAITING','CALLED')").run(now, appt.id);
    })();
    audit({
      clinicId,
      actorUserId: u.id,
      entityType: "appointment",
      entityId: appt.id,
      action: "APPOINTMENT_CANCELLED",
      oldValues: { status: appt.status },
      newValues: { status: target, reason: parsed.data.reason ?? null },
      req,
    });
    const patient = row<{ phone: string | null }>("SELECT phone FROM patient_profiles WHERE id = ?", appt.patient_id);
    const doctor = row<{ name: string }>("SELECT name FROM doctors WHERE id = ?", appt.doctor_id);
    const tz = row<{ timezone: string }>("SELECT timezone FROM clinics WHERE id = ?", clinicId)?.timezone ?? "Asia/Kolkata";
    queueNotification({
      clinicId,
      patientId: appt.patient_id,
      appointmentId: appt.id,
      templateKey: "appointment_cancelled",
      destination: patient?.phone ?? "",
      vars: {
        doctorName: (doctor?.name ?? "").replace(/^Dr\.\s*/, ""),
        date: localDate(Date.parse(appt.start_at), tz),
        time: new Date(appt.start_at).toLocaleTimeString("en-IN", { timeZone: tz, hour: "numeric", minute: "2-digit" }),
      },
    });
    return ok(res, 200, { appointment: shapeAppointment(getAppointment(appt.id)!) });
  })
);

const staffRescheduleSchema = z.object({ newStartAt: z.string().datetime({ offset: true }) });

// --- POST /reception/appointments/:id/reschedule ------------------------------------------------
router.post(
  "/appointments/:id/reschedule",
  ah(async (req, res) => {
    const parsed = staffRescheduleSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid request.", zodFieldErrors(parsed.error));
    const u = req.user!;
    const clinicId = staffClinic(req);
    const appt = staffGetAppointment(req.params.id, clinicId);
    if (!appt) return fail(res, 404, "NOT_FOUND", "Appointment not found.");
    if (!["BOOKED", "CONFIRMED"].includes(appt.status)) {
      return fail(res, 400, "CANNOT_RESCHEDULE", "Only upcoming appointments can be rescheduled.");
    }

    const service = getServiceInClinic(appt.service_id, clinicId)!;
    const ms = Date.parse(parsed.data.newStartAt);
    if (Number.isNaN(ms)) return fail(res, 400, "VALIDATION_ERROR", "Invalid newStartAt.");
    const tz = row<{ timezone: string }>("SELECT timezone FROM clinics WHERE id = ?", clinicId)?.timezone ?? "Asia/Kolkata";
    const date = localDate(ms, tz);
    const avail = generateAvailability(appt.doctor_id, date, service.duration_minutes);
    if (!avail.ok) return fail(res, 400, "DOCTOR_NOT_AVAILABLE", "Doctor is not available at the new time.");
    const slot = avail.slots.find((s) => s.startAt === parsed.data.newStartAt && s.status === "AVAILABLE");
    if (!slot) return fail(res, 409, "SLOT_UNAVAILABLE", "The new time is no longer available.");

    const now = nowIso();
    const newIdVal = newId();
    const settings = mergeSettings(row<{ settings: string | null }>("SELECT settings FROM clinics WHERE id = ?", clinicId)?.settings ?? null);
    const newStatus = settings.booking.autoConfirm ? "CONFIRMED" : "BOOKED";
    try {
      db.transaction(() => {
        db.prepare(
          `INSERT INTO appointments
             (id, appointment_number, clinic_id, doctor_id, patient_id, service_id, start_at, end_at,
              status, booking_source, booking_created_by, rescheduled_from_appointment_id, notes_for_clinic, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          newIdVal,
          nextAppointmentNumber(clinicId),
          clinicId,
          appt.doctor_id,
          appt.patient_id,
          appt.service_id,
          slot.startAt,
          slot.endAt,
          newStatus,
          "RECEPTION",
          u.id,
          appt.id,
          appt.notes_for_clinic,
          now,
          now
        );
        createPayment(newIdVal, service.fee ?? 0, newStatus === "CONFIRMED" ? "PAY_AT_CLINIC" : "PENDING", now);
        db.prepare("UPDATE appointments SET status = 'RESCHEDULED', updated_at = ? WHERE id = ?").run(now, appt.id);
      })();
    } catch (err) {
      if (isSqliteUniqueViolation(err)) {
        return fail(res, 409, "SLOT_UNAVAILABLE", "The new time is no longer available.");
      }
      throw err;
    }

    const newAppt = getAppointment(newIdVal)!;
    audit({
      clinicId,
      actorUserId: u.id,
      entityType: "appointment",
      entityId: newAppt.id,
      action: "APPOINTMENT_RESCHEDULED",
      oldValues: { startAt: appt.start_at },
      newValues: { startAt: newAppt.start_at },
      req,
    });
    return ok(res, 200, { appointment: shapeAppointment(newAppt) });
  })
);

const delaySchema = z.object({ delayMinutes: z.number().int().min(0).max(480), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

// --- POST /reception/doctors/:doctorId/delay -------------------------------------------------------
router.post(
  "/doctors/:doctorId/delay",
  ah(async (req, res) => {
    const parsed = delaySchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid request.", zodFieldErrors(parsed.error));
    const u = req.user!;
    const clinicId = staffClinic(req);
    const doctor = getDoctorInClinic(req.params.doctorId, clinicId);
    if (!doctor) return fail(res, 404, "NOT_FOUND", "Doctor not found.");
    const tz = row<{ timezone: string }>("SELECT timezone FROM clinics WHERE id = ?", clinicId)?.timezone ?? "Asia/Kolkata";
    const date = parsed.data.date ?? todayLocal(tz);
    const now = nowIso();
    const id = randomUUID();

    db.prepare(
      `INSERT INTO doctor_delays (id, doctor_id, date, delay_minutes, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (doctor_id, date) DO UPDATE SET delay_minutes = excluded.delay_minutes, created_by = excluded.created_by, created_at = excluded.created_at`
    ).run(id, doctor.id, date, parsed.data.delayMinutes, u.id, now);

    audit({
      clinicId,
      actorUserId: u.id,
      entityType: "doctor",
      entityId: doctor.id,
      action: "DOCTOR_DELAY_SET",
      newValues: { date, delayMinutes: parsed.data.delayMinutes },
      req,
    });

    // Notify patients currently waiting for this doctor today.
    const settings = mergeSettings(row<{ settings: string | null }>("SELECT settings FROM clinics WHERE id = ?", clinicId)?.settings ?? null);
    if (settings.notifications.delayNotificationEnabled && parsed.data.delayMinutes > 0) {
      const waiting = rows<{ patient_id: string; appointment_id: string | null }>(
        `SELECT DISTINCT patient_id, appointment_id FROM queue_tickets
         WHERE clinic_id = ? AND doctor_id = ? AND visit_date = ? AND status IN ('WAITING','CALLED')`,
        clinicId,
        doctor.id,
        date
      );
      for (const w of waiting) {
        const phone = row<{ phone: string | null }>("SELECT phone FROM patient_profiles WHERE id = ?", w.patient_id)?.phone;
        if (!phone) continue;
        queueNotification({
          clinicId,
          patientId: w.patient_id,
          appointmentId: w.appointment_id,
          templateKey: "doctor_delay",
          destination: phone,
          vars: { delay: parsed.data.delayMinutes },
        });
      }
    }
    return ok(res, 200, { ok: true, delayMinutes: parsed.data.delayMinutes });
  })
);

const blockSlotSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  reason: z.string().max(500).optional(),
});

// --- POST /reception/doctors/:doctorId/block-slot ------------------------------------------------------
router.post(
  "/doctors/:doctorId/block-slot",
  ah(async (req, res) => {
    const parsed = blockSlotSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid request.", zodFieldErrors(parsed.error));
    const u = req.user!;
    const clinicId = staffClinic(req);
    const doctor = getDoctorInClinic(req.params.doctorId, clinicId);
    if (!doctor) return fail(res, 404, "NOT_FOUND", "Doctor not found.");
    if (parsed.data.startTime >= parsed.data.endTime) {
      return fail(res, 400, "VALIDATION_ERROR", "endTime must be after startTime.", { endTime: "Must be after startTime." });
    }
    const now = nowIso();
    const id = randomUUID();
    db.prepare(
      `INSERT INTO schedule_exceptions (id, doctor_id, date, type, start_time, end_time, reason, created_by, created_at)
       VALUES (?, ?, ?, 'BLOCK', ?, ?, ?, ?, ?)`
    ).run(id, doctor.id, parsed.data.date, parsed.data.startTime, parsed.data.endTime, parsed.data.reason ?? null, u.id, now);

    audit({
      clinicId,
      actorUserId: u.id,
      entityType: "schedule_exception",
      entityId: id,
      action: "SLOT_BLOCKED",
      newValues: { doctorId: doctor.id, date: parsed.data.date, startTime: parsed.data.startTime, endTime: parsed.data.endTime, reason: parsed.data.reason ?? null },
      req,
    });
    const ex = row("SELECT * FROM schedule_exceptions WHERE id = ?", id);
    return ok(res, 201, {
      exception: {
        id,
        doctorId: doctor.id,
        date: parsed.data.date,
        type: "BLOCK",
        startTime: parsed.data.startTime,
        endTime: parsed.data.endTime,
        reason: parsed.data.reason ?? null,
        createdAt: (ex as { created_at: string }).created_at,
      },
    });
  })
);

// --- GET /reception/patients/search ----------------------------------------------------------------------
router.get(
  "/patients/search",
  ah(async (req, res) => {
    staffClinic(req);
    const q = ((req.query.q as string) ?? "").trim();
    if (q.length < 2) return ok(res, 200, { patients: [] });
    const like = `%${q}%`;
    const results = rows<{ id: string; full_name: string; phone: string | null }>(
      `SELECT id, full_name, phone FROM patient_profiles
       WHERE full_name LIKE ? OR phone LIKE ? ORDER BY full_name ASC LIMIT 20`,
      like,
      like
    ).map((p) => {
      const last = row<{ start_at: string }>(
        "SELECT start_at FROM appointments WHERE patient_id = ? ORDER BY start_at DESC LIMIT 1",
        p.id
      );
      return {
        id: p.id,
        fullName: p.full_name,
        phoneMasked: maskPhone(p.phone),
        lastVisit: last?.start_at ?? null,
      };
    });
    return ok(res, 200, { patients: results });
  })
);

const createPatientSchema = z.object({
  fullName: z.string().min(1).max(120),
  phone: z.string().min(10).max(15),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  gender: z.string().max(20).optional(),
});

// --- POST /reception/patients -------------------------------------------------------------------------------
router.post(
  "/patients",
  ah(async (req, res) => {
    const parsed = createPatientSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid request.", zodFieldErrors(parsed.error));
    const u = req.user!;
    const clinicId = staffClinic(req);
    const { id, duplicateWarning } = findOrCreatePatient(parsed.data);
    const patient = row<{ id: string; full_name: string; phone: string | null; date_of_birth: string | null; gender: string | null }>(
      "SELECT id, full_name, phone, date_of_birth, gender FROM patient_profiles WHERE id = ?",
      id
    )!;
    audit({
      clinicId,
      actorUserId: u.id,
      entityType: "patient",
      entityId: id,
      action: "PATIENT_CREATED",
      newValues: { fullName: patient.full_name, phone: maskPhone(patient.phone) },
      req,
    });
    return ok(res, 201, {
      patient: {
        id: patient.id,
        fullName: patient.full_name,
        phone: patient.phone,
        dateOfBirth: patient.date_of_birth,
        gender: patient.gender,
      },
      ...(duplicateWarning ? { duplicateWarning } : {}),
    });
  })
);

export default router;
