import { Router } from "express";
import { z } from "zod";
import { config } from "../../config";
import { db, row, rows } from "../../db";
import { ah, fail, isSqliteUniqueViolation, ok, zodFieldErrors } from "../../lib/http";
import { localDate, nowIso } from "../../lib/time";
import { requireAuth, requireRole } from "../../middleware/auth";
import { ACTIVE_APPOINTMENT_STATUSES, mergeSettings } from "../../types";
import { generateAvailability } from "../../services/availability";
import { audit } from "../../services/audit";
import { queueNotification } from "../../services/notifications";
import {
  activeTicketForAppointment,
  callerPatientIds,
  canTransition,
  getAppointment,
  newId,
  nextAppointmentNumber,
  shapeAppointment,
  type AppointmentRow,
} from "../../services/appointments";
import { createTicket, queueView } from "../../services/queue";

const router = Router();
router.use(requireAuth, requireRole("PATIENT"));

function clinicContext(doctorId: string): { clinicId: string; timezone: string } {
  const doctor = row<{ clinic_id: string }>("SELECT clinic_id FROM doctors WHERE id = ?", doctorId);
  const clinicId = doctor?.clinic_id ?? "";
  const clinic = row<{ timezone: string }>("SELECT timezone FROM clinics WHERE id = ?", clinicId);
  return { clinicId, timezone: clinic?.timezone ?? "Asia/Kolkata" };
}

function patientBelongsToCaller(patientId: string, userId: string): boolean {
  return callerPatientIds(userId).includes(patientId);
}

function patientOf(patientId: string) {
  return row<{ id: string; full_name: string; phone: string | null }>(
    "SELECT id, full_name, phone FROM patient_profiles WHERE id = ?",
    patientId
  );
}

function doctorOf(doctorId: string) {
  return row<{ id: string; name: string; clinic_id: string; status: string }>(
    "SELECT id, name, clinic_id, status FROM doctors WHERE id = ?",
    doctorId
  );
}

function serviceOf(serviceId: string) {
  return row<{ id: string; name: string; duration_minutes: number; fee: number | null; status: string }>(
    "SELECT id, name, duration_minutes, fee, status FROM services WHERE id = ?",
    serviceId
  );
}

function notifyVars(appt: AppointmentRow) {
  const doctor = doctorOf(appt.doctor_id);
  const ms = Date.parse(appt.start_at);
  const clinic = row<{ timezone: string }>("SELECT timezone FROM clinics WHERE id = ?", appt.clinic_id);
  const tz = clinic?.timezone ?? "Asia/Kolkata";
  return {
    doctorName: doctor?.name.replace(/^Dr\.\s*/, "") ?? "",
    date: localDate(ms, tz),
    time: new Date(ms).toLocaleTimeString("en-IN", { timeZone: tz, hour: "numeric", minute: "2-digit" }),
  };
}

/** Verify the requested startAt is a bookable AVAILABLE slot; returns {startAt,endAt}. */
function assertSlotAvailable(
  doctorId: string,
  serviceDuration: number,
  startAt: string
): { startAt: string; endAt: string } | { error: "SLOT_UNAVAILABLE" | "DOCTOR_NOT_AVAILABLE" } {
  const ms = Date.parse(startAt);
  if (Number.isNaN(ms)) return { error: "SLOT_UNAVAILABLE" };
  const { timezone } = clinicContext(doctorId);
  const date = localDate(ms, timezone);
  const avail = generateAvailability(doctorId, date, serviceDuration);
  if (!avail.ok) return { error: "DOCTOR_NOT_AVAILABLE" };
  const slot = avail.slots.find((s) => s.startAt === startAt && s.status === "AVAILABLE");
  if (!slot) return { error: "SLOT_UNAVAILABLE" };
  return { startAt: slot.startAt, endAt: slot.endAt };
}

const holdSchema = z.object({
  doctorId: z.string().uuid(),
  serviceId: z.string().uuid(),
  startAt: z.string().datetime({ offset: true }),
  patientId: z.string().uuid(),
});

// --- Hold sweeper: expire stale holds every 60s --------------------------------
export function startHoldSweeper(): NodeJS.Timeout {
  const sweep = () => {
    try {
      const now = nowIso();
      const stale = rows<AppointmentRow>(
        "SELECT * FROM appointments WHERE status = 'HELD' AND hold_expires_at IS NOT NULL AND hold_expires_at < ?",
        now
      );
      if (stale.length === 0) return;
      const stmt = db.prepare(
        "UPDATE appointments SET status = 'EXPIRED', hold_expires_at = NULL, updated_at = ? WHERE id = ? AND status = 'HELD'"
      );
      const tx = db.transaction((list: AppointmentRow[]) => {
        for (const a of list) stmt.run(now, a.id);
      });
      tx(stale);
      console.log(`[holds] expired ${stale.length} stale hold(s)`);
    } catch (err) {
      console.error("[holds] sweeper error:", (err as Error).message);
    }
  };
  const t = setInterval(sweep, 60_000);
  t.unref?.();
  return t;
}

// --- POST /appointments/hold ---------------------------------------------------
router.post(
  "/hold",
  ah(async (req, res) => {
    const parsed = holdSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid request.", zodFieldErrors(parsed.error));
    const u = req.user!;
    const { doctorId, serviceId, startAt, patientId } = parsed.data;

    if (!patientBelongsToCaller(patientId, u.id)) {
      return fail(res, 403, "FORBIDDEN", "You can only book for yourself or your family members.");
    }
    const doctor = doctorOf(doctorId);
    if (!doctor || doctor.status !== "ACTIVE") return fail(res, 404, "DOCTOR_NOT_AVAILABLE", "Doctor is not available.");
    const service = serviceOf(serviceId);
    if (!service || service.status !== "ACTIVE") return fail(res, 404, "NOT_FOUND", "Service not found.");

    const slot = assertSlotAvailable(doctorId, service.duration_minutes, startAt);
    if ("error" in slot) {
      return slot.error === "SLOT_UNAVAILABLE"
        ? fail(res, 409, "SLOT_UNAVAILABLE", "This appointment time is no longer available.")
        : fail(res, 400, "DOCTOR_NOT_AVAILABLE", "Doctor is not available on the selected date.");
    }

    const now = nowIso();
    const holdExpiresAt = new Date(Date.now() + config.holdTtlMinutes * 60 * 1000).toISOString();
    const id = newId();
    try {
      const tx = db.transaction(() => {
        db.prepare(
          `INSERT INTO appointments
             (id, appointment_number, clinic_id, doctor_id, patient_id, service_id, start_at, end_at,
              status, booking_source, booking_created_by, hold_expires_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'HELD', 'PATIENT_APP', ?, ?, ?, ?)`
        ).run(
          id,
          nextAppointmentNumber(doctor.clinic_id),
          doctor.clinic_id,
          doctorId,
          patientId,
          serviceId,
          slot.startAt,
          slot.endAt,
          u.id,
          holdExpiresAt,
          now,
          now
        );
      });
      tx();
    } catch (err) {
      if (isSqliteUniqueViolation(err)) {
        return fail(res, 409, "SLOT_UNAVAILABLE", "This appointment time is no longer available.");
      }
      throw err;
    }

    const hold = getAppointment(id)!;
    return ok(res, 201, {
      hold: {
        id: hold.id,
        doctorId: hold.doctor_id,
        startAt: hold.start_at,
        endAt: hold.end_at,
        holdExpiresAt: hold.hold_expires_at,
      },
    });
  })
);

const createSchema = z.object({
  holdId: z.string().uuid().optional(),
  doctorId: z.string().uuid().optional(),
  serviceId: z.string().uuid().optional(),
  startAt: z.string().datetime({ offset: true }).optional(),
  patientId: z.string().uuid().optional(),
  notesForClinic: z.string().max(1000).optional(),
  idempotencyKey: z.string().max(100).optional(),
});

// --- POST /appointments (confirm hold OR direct book) ---------------------------
router.post(
  "/",
  ah(async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid request.", zodFieldErrors(parsed.error));
    const u = req.user!;
    const b = parsed.data;

    // Idempotency: a retried request with the same key returns the original.
    if (b.idempotencyKey) {
      const existing = row<AppointmentRow>(
        "SELECT * FROM appointments WHERE idempotency_key = ? AND booking_created_by = ?",
        b.idempotencyKey,
        u.id
      );
      if (existing) return ok(res, 200, { appointment: shapeAppointment(existing) });
    }

    let apptId: string;
    if (b.holdId) {
      const hold = getAppointment(b.holdId);
      if (!hold || hold.booking_created_by !== u.id) {
        return fail(res, 404, "NOT_FOUND", "Hold not found.");
      }
      if (hold.status !== "HELD" || (hold.hold_expires_at && hold.hold_expires_at < nowIso())) {
        return fail(res, 409, "SLOT_UNAVAILABLE", "This hold has expired. Please choose the slot again.");
      }
      apptId = confirmAppointment(hold, u.id, b.notesForClinic, req);
    } else {
      if (!b.doctorId || !b.serviceId || !b.startAt || !b.patientId) {
        return fail(res, 400, "VALIDATION_ERROR", "doctorId, serviceId, startAt and patientId are required.", {
          startAt: "Select a slot to book.",
        });
      }
      if (!patientBelongsToCaller(b.patientId, u.id)) {
        return fail(res, 403, "FORBIDDEN", "You can only book for yourself or your family members.");
      }
      const doctor = doctorOf(b.doctorId);
      if (!doctor || doctor.status !== "ACTIVE") return fail(res, 404, "DOCTOR_NOT_AVAILABLE", "Doctor is not available.");
      const service = serviceOf(b.serviceId);
      if (!service || service.status !== "ACTIVE") return fail(res, 404, "NOT_FOUND", "Service not found.");

      const slot = assertSlotAvailable(b.doctorId, service.duration_minutes, b.startAt);
      if ("error" in slot) {
        return slot.error === "SLOT_UNAVAILABLE"
          ? fail(res, 409, "SLOT_UNAVAILABLE", "This appointment time is no longer available.")
          : fail(res, 400, "DOCTOR_NOT_AVAILABLE", "Doctor is not available on the selected date.");
      }

      const settings = mergeSettings(
        row<{ settings: string | null }>("SELECT settings FROM clinics WHERE id = ?", doctor.clinic_id)?.settings ?? null
      );
      const status = settings.booking.autoConfirm ? "CONFIRMED" : "BOOKED";
      const now = nowIso();
      const id = newId();
      try {
        const tx = db.transaction(() => {
          db.prepare(
            `INSERT INTO appointments
               (id, appointment_number, clinic_id, doctor_id, patient_id, service_id, start_at, end_at,
                status, booking_source, booking_created_by, idempotency_key, notes_for_clinic, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PATIENT_APP', ?, ?, ?, ?, ?)`
          ).run(
            id,
            nextAppointmentNumber(doctor.clinic_id),
            doctor.clinic_id,
            b.doctorId!,
            b.patientId!,
            b.serviceId!,
            slot.startAt,
            slot.endAt,
            status,
            u.id,
            b.idempotencyKey ?? null,
            b.notesForClinic ?? null,
            now,
            now
          );
          createPayment(id, service.fee ?? 0, status === "CONFIRMED" ? "PAY_AT_CLINIC" : "PENDING", now);
        });
        tx();
      } catch (err) {
        if (isSqliteUniqueViolation(err)) {
          return fail(res, 409, "SLOT_UNAVAILABLE", "This appointment time is no longer available.");
        }
        throw err;
      }
      apptId = id;
      const appt = getAppointment(apptId)!;
      audit({
        clinicId: appt.clinic_id,
        actorUserId: u.id,
        entityType: "appointment",
        entityId: appt.id,
        action: "APPOINTMENT_CREATED",
        newValues: { status: appt.status, startAt: appt.start_at },
        req,
      });
      const patient = patientOf(appt.patient_id);
      queueNotification({
        clinicId: appt.clinic_id,
        patientId: appt.patient_id,
        appointmentId: appt.id,
        templateKey: "appointment_confirmed",
        destination: patient?.phone ?? "",
        vars: notifyVars(appt),
      });
    }

    const appt = getAppointment(apptId)!;
    return ok(res, 201, { appointment: shapeAppointment(appt) });
  })
);

/** Convert a HELD appointment into BOOKED/CONFIRMED inside a transaction. */
export function confirmAppointment(
  hold: AppointmentRow,
  userId: string,
  notesForClinic: string | undefined,
  req?: { ip?: string; headers?: Record<string, unknown> }
): string {
  const now = nowIso();
  const settings = mergeSettings(
    row<{ settings: string | null }>("SELECT settings FROM clinics WHERE id = ?", hold.clinic_id)?.settings ?? null
  );
  const status = settings.booking.autoConfirm ? "CONFIRMED" : "BOOKED";
  const service = serviceOf(hold.service_id);
  const tx = db.transaction(() => {
    // Re-check the hold is still valid inside the transaction; the unique
    // index guarantees only one active appointment per slot.
    const fresh = getAppointment(hold.id);
    if (!fresh || fresh.status !== "HELD") throw Object.assign(new Error("Hold lost"), { code: "SLOT_TAKEN" });
    db.prepare(
      `UPDATE appointments SET status = ?, hold_expires_at = NULL,
         notes_for_clinic = COALESCE(?, notes_for_clinic), updated_at = ? WHERE id = ?`
    ).run(status, notesForClinic ?? null, now, hold.id);
    createPayment(hold.id, service?.fee ?? 0, status === "CONFIRMED" ? "PAY_AT_CLINIC" : "PENDING", now);
  });
  try {
    tx();
  } catch (err) {
    if ((err as { code?: string }).code === "SLOT_TAKEN" || isSqliteUniqueViolation(err)) {
      throw Object.assign(new Error("slot unavailable"), { httpCode: 409, errorCode: "SLOT_UNAVAILABLE" });
    }
    throw err;
  }
  const appt = getAppointment(hold.id)!;
  audit({
    clinicId: appt.clinic_id,
    actorUserId: userId,
    entityType: "appointment",
    entityId: appt.id,
    action: "APPOINTMENT_CREATED",
    newValues: { status: appt.status, startAt: appt.start_at },
    req: req as never,
  });
  const patient = patientOf(appt.patient_id);
  queueNotification({
    clinicId: appt.clinic_id,
    patientId: appt.patient_id,
    appointmentId: appt.id,
    templateKey: "appointment_confirmed",
    destination: patient?.phone ?? "",
    vars: notifyVars(appt),
  });
  return appt.id;
}

function createPayment(appointmentId: string, amount: number, status: string, now: string): void {
  db.prepare(
    `INSERT INTO payments (id, appointment_id, amount, currency, status, created_at, updated_at)
     VALUES (?, ?, ?, 'INR', ?, ?, ?)`
  ).run(newId(), appointmentId, amount, status, now, now);
}

// --- GET /appointments?scope= ---------------------------------------------------
router.get(
  "/",
  ah(async (req, res) => {
    const u = req.user!;
    const scope = req.query.scope === "past" || req.query.scope === "cancelled" ? req.query.scope : "upcoming";
    const patientIds = callerPatientIds(u.id);
    if (patientIds.length === 0) return ok(res, 200, { appointments: [] });
    const placeholders = patientIds.map(() => "?").join(",");
    const now = nowIso();

    let statusFilter: string;
    if (scope === "past") statusFilter = "status IN ('COMPLETED','NO_SHOW')";
    else if (scope === "cancelled") statusFilter = "status IN ('CANCELLED','EXPIRED','RESCHEDULED')";
    else
      statusFilter = `status IN ('HELD','BOOKED','CONFIRMED','CHECKED_IN','WAITING','IN_CONSULTATION') AND (status != 'HELD' OR hold_expires_at IS NULL OR hold_expires_at > '${now}')`;

    const list = rows<AppointmentRow>(
      `SELECT * FROM appointments WHERE patient_id IN (${placeholders}) AND ${statusFilter}
       ORDER BY start_at ${scope === "upcoming" ? "ASC" : "DESC"}`,
      ...patientIds
    );
    return ok(res, 200, { appointments: list.map(shapeAppointment) });
  })
);

function ownAppointmentOr404(id: string, userId: string): AppointmentRow | undefined {
  const appt = getAppointment(id);
  if (!appt) return undefined;
  if (!patientBelongsToCaller(appt.patient_id, userId)) return undefined;
  return appt;
}

// --- GET /appointments/:id ------------------------------------------------------
router.get(
  "/:id",
  ah(async (req, res) => {
    const u = req.user!;
    const appt = ownAppointmentOr404(req.params.id, u.id);
    if (!appt) return fail(res, 404, "NOT_FOUND", "Appointment not found.");
    return ok(res, 200, { appointment: shapeAppointment(appt) });
  })
);

const cancelSchema = z.object({ reason: z.string().max(500).optional() });

function cutoffAllows(settingsCutoffMin: number, startAt: string): boolean {
  return Date.now() <= Date.parse(startAt) - settingsCutoffMin * 60 * 1000;
}

function bookingSettings(clinicId: string) {
  return mergeSettings(
    row<{ settings: string | null }>("SELECT settings FROM clinics WHERE id = ?", clinicId)?.settings ?? null
  ).booking;
}

// --- POST /appointments/:id/cancel ----------------------------------------------
router.post(
  "/:id/cancel",
  ah(async (req, res) => {
    const parsed = cancelSchema.safeParse(req.body ?? {});
    if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid request.", zodFieldErrors(parsed.error));
    const u = req.user!;
    const appt = ownAppointmentOr404(req.params.id, u.id);
    if (!appt) return fail(res, 404, "NOT_FOUND", "Appointment not found.");

    if (appt.status === "CANCELLED") {
      return fail(res, 409, "APPOINTMENT_ALREADY_CANCELLED", "This appointment is already cancelled.");
    }
    if (["COMPLETED", "NO_SHOW", "EXPIRED", "RESCHEDULED"].includes(appt.status)) {
      return fail(res, 409, "APPOINTMENT_ALREADY_COMPLETED", "This appointment can no longer be cancelled.");
    }

    const cutoff = bookingSettings(appt.clinic_id).cancellationCutoffMinutes;
    if (!cutoffAllows(cutoff, appt.start_at)) {
      return fail(res, 400, "VALIDATION_ERROR", `Cancellations must be made at least ${cutoff} minutes before the appointment.`);
    }

    const now = nowIso();
    const target = appt.status === "HELD" ? "EXPIRED" : "CANCELLED";
    const tx = db.transaction(() => {
      db.prepare(
        `UPDATE appointments SET status = ?, cancellation_reason = ?, cancelled_at = ?, hold_expires_at = NULL, updated_at = ?
         WHERE id = ?`
      ).run(target, parsed.data.reason ?? null, now, now, appt.id);
      const ticket = activeTicketForAppointment(appt.id);
      if (ticket) {
        db.prepare("UPDATE queue_tickets SET status = 'CANCELLED', updated_at = ? WHERE id = ?").run(now, ticket.id);
      }
    });
    tx();

    const updated = getAppointment(appt.id)!;
    audit({
      clinicId: appt.clinic_id,
      actorUserId: u.id,
      entityType: "appointment",
      entityId: appt.id,
      action: "APPOINTMENT_CANCELLED",
      oldValues: { status: appt.status },
      newValues: { status: updated.status, reason: parsed.data.reason ?? null },
      req,
    });
    const patient = patientOf(appt.patient_id);
    queueNotification({
      clinicId: appt.clinic_id,
      patientId: appt.patient_id,
      appointmentId: appt.id,
      templateKey: "appointment_cancelled",
      destination: patient?.phone ?? "",
      vars: notifyVars(appt),
    });
    return ok(res, 200, { appointment: shapeAppointment(updated) });
  })
);

const rescheduleSchema = z.object({
  newStartAt: z.string().datetime({ offset: true }),
  holdId: z.string().uuid().optional(),
});

// --- POST /appointments/:id/reschedule -------------------------------------------
router.post(
  "/:id/reschedule",
  ah(async (req, res) => {
    const parsed = rescheduleSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid request.", zodFieldErrors(parsed.error));
    const u = req.user!;
    const appt = ownAppointmentOr404(req.params.id, u.id);
    if (!appt) return fail(res, 404, "NOT_FOUND", "Appointment not found.");

    if (!["BOOKED", "CONFIRMED"].includes(appt.status)) {
      return fail(res, 400, "CANNOT_RESCHEDULE", "Only upcoming confirmed appointments can be rescheduled.");
    }
    const cutoff = bookingSettings(appt.clinic_id).rescheduleCutoffMinutes;
    if (!cutoffAllows(cutoff, appt.start_at)) {
      return fail(res, 400, "CANNOT_RESCHEDULE", `Rescheduling must be done at least ${cutoff} minutes before the appointment.`);
    }

    const service = serviceOf(appt.service_id)!;
    let hold: AppointmentRow | undefined;
    if (parsed.data.holdId) {
      hold = getAppointment(parsed.data.holdId);
      if (!hold || hold.booking_created_by !== u.id || hold.status !== "HELD") {
        return fail(res, 404, "NOT_FOUND", "Hold not found or expired.");
      }
    } else {
      const slot = assertSlotAvailable(appt.doctor_id, service.duration_minutes, parsed.data.newStartAt);
      if ("error" in slot) {
        return slot.error === "SLOT_UNAVAILABLE"
          ? fail(res, 409, "SLOT_UNAVAILABLE", "The new time is no longer available.")
          : fail(res, 400, "DOCTOR_NOT_AVAILABLE", "Doctor is not available at the new time.");
      }
    }

    const now = nowIso();
    const newIdVal = newId();
    const newStartAt = hold ? hold.start_at : parsed.data.newStartAt;
    const newEndAt = hold
      ? hold.end_at
      : new Date(Date.parse(parsed.data.newStartAt) + service.duration_minutes * 60 * 1000).toISOString();
    const settings = bookingSettings(appt.clinic_id);
    const newStatus = settings.autoConfirm ? "CONFIRMED" : "BOOKED";

    try {
      const tx = db.transaction(() => {
        if (hold) {
          const fresh = getAppointment(hold!.id);
          if (!fresh || fresh.status !== "HELD") throw Object.assign(new Error("hold lost"), { code: "SLOT_TAKEN" });
          db.prepare("UPDATE appointments SET status = ?, hold_expires_at = NULL, updated_at = ? WHERE id = ?").run(
            newStatus,
            now,
            hold!.id
          );
          createPayment(hold!.id, service.fee ?? 0, newStatus === "CONFIRMED" ? "PAY_AT_CLINIC" : "PENDING", now);
        } else {
          db.prepare(
            `INSERT INTO appointments
               (id, appointment_number, clinic_id, doctor_id, patient_id, service_id, start_at, end_at,
                status, booking_source, booking_created_by, rescheduled_from_appointment_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PATIENT_APP', ?, ?, ?, ?)`
          ).run(
            newIdVal,
            nextAppointmentNumber(appt.clinic_id),
            appt.clinic_id,
            appt.doctor_id,
            appt.patient_id,
            appt.service_id,
            newStartAt,
            newEndAt,
            newStatus,
            u.id,
            appt.id,
            now,
            now
          );
          createPayment(newIdVal, service.fee ?? 0, newStatus === "CONFIRMED" ? "PAY_AT_CLINIC" : "PENDING", now);
        }
        db.prepare(
          `UPDATE appointments SET status = 'RESCHEDULED', rescheduled_from_appointment_id = NULL, updated_at = ? WHERE id = ?`
        ).run(now, appt.id);
        const targetId = hold ? hold!.id : newIdVal;
        db.prepare("UPDATE appointments SET rescheduled_from_appointment_id = ? WHERE id = ?").run(appt.id, targetId);
      });
      tx();
    } catch (err) {
      if ((err as { code?: string }).code === "SLOT_TAKEN" || isSqliteUniqueViolation(err)) {
        return fail(res, 409, "SLOT_UNAVAILABLE", "The new time is no longer available.");
      }
      throw err;
    }

    const newAppt = getAppointment(hold ? hold.id : newIdVal)!;
    const oldAppt = getAppointment(appt.id)!;
    audit({
      clinicId: appt.clinic_id,
      actorUserId: u.id,
      entityType: "appointment",
      entityId: newAppt.id,
      action: "APPOINTMENT_RESCHEDULED",
      oldValues: { startAt: appt.start_at },
      newValues: { startAt: newAppt.start_at },
      req,
    });
    const patient = patientOf(appt.patient_id);
    queueNotification({
      clinicId: appt.clinic_id,
      patientId: appt.patient_id,
      appointmentId: newAppt.id,
      templateKey: "appointment_rescheduled",
      destination: patient?.phone ?? "",
      vars: notifyVars(newAppt),
    });
    return ok(res, 200, { appointment: shapeAppointment(newAppt), oldAppointment: shapeAppointment(oldAppt) });
  })
);

// --- POST /appointments/:id/check-in ----------------------------------------------
router.post(
  "/:id/check-in",
  ah(async (req, res) => {
    const u = req.user!;
    const appt = ownAppointmentOr404(req.params.id, u.id);
    if (!appt) return fail(res, 404, "NOT_FOUND", "Appointment not found.");
    if (!["BOOKED", "CONFIRMED"].includes(appt.status)) {
      return fail(res, 400, "VALIDATION_ERROR", "Only upcoming appointments can be checked in.");
    }

    const clinic = row<{ timezone: string }>("SELECT timezone FROM clinics WHERE id = ?", appt.clinic_id);
    const tz = clinic?.timezone ?? "Asia/Kolkata";
    const visitDate = localDate(Date.now(), tz);
    const now = nowIso();

    const tx = db.transaction(() => {
      const existing = activeTicketForAppointment(appt.id);
      if (existing) throw Object.assign(new Error("already checked in"), { code: "ALREADY" });
      db.prepare(
        `UPDATE appointments SET status = 'CHECKED_IN', checked_in_at = ?, updated_at = ? WHERE id = ?`
      ).run(now, now, appt.id);
    });
    try {
      tx();
    } catch (err) {
      if ((err as { code?: string }).code === "ALREADY") {
        return fail(res, 400, "VALIDATION_ERROR", "Already checked in.");
      }
      throw err;
    }

    const ticket = createTicket({
      clinicId: appt.clinic_id,
      doctorId: appt.doctor_id,
      appointmentId: appt.id,
      patientId: appt.patient_id,
      visitDate,
    });
    const view = queueView(appt.clinic_id, appt.doctor_id, visitDate);
    const mine = view.queue.find((t) => t.id === ticket.id);
    const updated = getAppointment(appt.id)!;

    audit({
      clinicId: appt.clinic_id,
      actorUserId: u.id,
      entityType: "appointment",
      entityId: appt.id,
      action: "APPOINTMENT_CHECKED_IN",
      oldValues: { status: appt.status },
      newValues: { status: "CHECKED_IN", tokenNumber: ticket.token_number },
      req,
    });
    const patient = patientOf(appt.patient_id);
    queueNotification({
      clinicId: appt.clinic_id,
      patientId: appt.patient_id,
      appointmentId: appt.id,
      templateKey: "checked_in",
      destination: patient?.phone ?? "",
      vars: { token: ticket.token_number, patientsBefore: mine?.estimatedWaitMinutes ? Math.round(mine.estimatedWaitMinutes / 20) : 0, wait: mine?.estimatedWaitMinutes ?? 0 },
    });

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

export default router;
