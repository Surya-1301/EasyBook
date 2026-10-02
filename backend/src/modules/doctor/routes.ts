import { Router } from "express";
import { z } from "zod";
import { db, row, rows } from "../../db";
import { ah, fail, ok, zodFieldErrors } from "../../lib/http";
import { localDate, nowIso } from "../../lib/time";
import { requireAuth, requireRole } from "../../middleware/auth";
import { audit } from "../../services/audit";
import { getAppointment, shapeAppointment, type AppointmentRow } from "../../services/appointments";
import { getTicket, queueView, todayLocal } from "../../services/queue";

const router = Router();
router.use(requireAuth, requireRole("DOCTOR"));

function doctorCtx(req: { user?: { doctorId: string | null; clinicId: string | null; id: string } }) {
  const doctorId = req.user?.doctorId;
  if (!doctorId) throw Object.assign(new Error("no doctor"), { httpCode: 403, errorCode: "FORBIDDEN" });
  const doctor = row<{ id: string; clinic_id: string; name: string }>("SELECT id, clinic_id, name FROM doctors WHERE id = ?", doctorId)!;
  const tz = row<{ timezone: string }>("SELECT timezone FROM clinics WHERE id = ?", doctor.clinic_id)?.timezone ?? "Asia/Kolkata";
  return { doctorId, clinicId: doctor.clinic_id, tz, userId: req.user!.id };
}

function todayAppointments(doctorId: string, tz: string) {
  const date = todayLocal(tz);
  return rows<AppointmentRow>(
    `SELECT * FROM appointments WHERE doctor_id = ?
       AND status IN ('BOOKED','CONFIRMED','CHECKED_IN','WAITING','IN_CONSULTATION','COMPLETED','NO_SHOW','CANCELLED')
     ORDER BY start_at ASC`,
    doctorId
  ).filter((a) => localDate(Date.parse(a.start_at), tz) === date);
}

// --- GET /doctor/me/today ----------------------------------------------------------------
router.get(
  "/me/today",
  ah(async (req, res) => {
    const { doctorId, clinicId, tz } = doctorCtx(req);
    const date = todayLocal(tz);
    const list = todayAppointments(doctorId, tz);
    const now = nowIso();

    const current = list.find((a) => a.status === "IN_CONSULTATION");
    const next = list.find((a) => ["BOOKED", "CONFIRMED", "CHECKED_IN", "WAITING"].includes(a.status));

    const count = (s: string) => list.filter((a) => a.status === s).length;
    return ok(res, 200, {
      date,
      stats: {
        total: list.length,
        completed: count("COMPLETED"),
        waiting: count("WAITING") + count("CHECKED_IN"),
        upcoming: list.filter((a) => ["BOOKED", "CONFIRMED"].includes(a.status) && a.start_at >= now).length,
        noShow: count("NO_SHOW"),
        cancelled: count("CANCELLED"),
      },
      current: current ? shapeAppointment(current) : null,
      next: next ? shapeAppointment(next) : null,
      appointments: list.map((a) => {
        const shaped = shapeAppointment(a);
        const ticket = row<{ status: string; token_number: number }>(
          "SELECT status, token_number FROM queue_tickets WHERE appointment_id = ? ORDER BY created_at DESC LIMIT 1",
          a.id
        );
        return { ...shaped, queueStatus: ticket?.status ?? null, tokenNumber: ticket?.token_number ?? shaped.tokenNumber };
      }),
      _clinicId: clinicId,
    });
  })
);

// --- GET /doctor/me/queue ------------------------------------------------------------------
router.get(
  "/me/queue",
  ah(async (req, res) => {
    const { doctorId, clinicId, tz } = doctorCtx(req);
    return ok(res, 200, queueView(clinicId, doctorId, todayLocal(tz)));
  })
);

// --- POST /doctor/queue/:id/start ------------------------------------------------------------
router.post(
  "/queue/:id/start",
  ah(async (req, res) => {
    const { doctorId, clinicId, userId } = doctorCtx(req);
    const ticket = getTicket(req.params.id);
    if (!ticket || ticket.doctor_id !== doctorId) return fail(res, 404, "NOT_FOUND", "Queue ticket not found.");
    if (!["WAITING", "CALLED"].includes(ticket.status)) {
      return fail(res, 400, "VALIDATION_ERROR", `Cannot start consultation from ${ticket.status}.`);
    }
    const now = nowIso();
    db.transaction(() => {
      db.prepare(
        "UPDATE queue_tickets SET status = 'IN_CONSULTATION', consultation_started_at = ?, updated_at = ? WHERE id = ?"
      ).run(now, now, ticket.id);
      if (ticket.appointment_id) {
        db.prepare(
          `UPDATE appointments SET status = 'IN_CONSULTATION', consultation_started_at = ?, updated_at = ?
           WHERE id = ? AND status IN ('CHECKED_IN','WAITING','CONFIRMED','BOOKED')`
        ).run(now, now, ticket.appointment_id);
      }
    })();
    audit({
      clinicId,
      actorUserId: userId,
      entityType: "queue_ticket",
      entityId: ticket.id,
      action: "CONSULTATION_STARTED",
      oldValues: { status: ticket.status },
      newValues: { status: "IN_CONSULTATION" },
      req,
    });
    const updated = getTicket(ticket.id)!;
    const appointment = ticket.appointment_id ? getAppointment(ticket.appointment_id) : undefined;
    return ok(res, 200, {
      ticket: { id: updated.id, tokenNumber: updated.token_number, status: updated.status, position: updated.position },
      appointment: appointment ? shapeAppointment(appointment) : null,
    });
  })
);

// --- POST /doctor/queue/:id/complete -------------------------------------------------------------
router.post(
  "/queue/:id/complete",
  ah(async (req, res) => {
    const { doctorId, clinicId, userId } = doctorCtx(req);
    const ticket = getTicket(req.params.id);
    if (!ticket || ticket.doctor_id !== doctorId) return fail(res, 404, "NOT_FOUND", "Queue ticket not found.");
    if (ticket.status !== "IN_CONSULTATION") {
      return fail(res, 400, "VALIDATION_ERROR", `Cannot complete from ${ticket.status}. Start the consultation first.`);
    }
    const now = nowIso();
    db.transaction(() => {
      db.prepare(
        "UPDATE queue_tickets SET status = 'COMPLETED', consultation_completed_at = ?, updated_at = ? WHERE id = ?"
      ).run(now, now, ticket.id);
      if (ticket.appointment_id) {
        db.prepare(
          `UPDATE appointments SET status = 'COMPLETED', consultation_completed_at = ?, updated_at = ?
           WHERE id = ? AND status IN ('IN_CONSULTATION','CHECKED_IN','WAITING')`
        ).run(now, now, ticket.appointment_id);
      }
    })();
    audit({
      clinicId,
      actorUserId: userId,
      entityType: "queue_ticket",
      entityId: ticket.id,
      action: "CONSULTATION_COMPLETED",
      oldValues: { status: ticket.status },
      newValues: { status: "COMPLETED" },
      req,
    });
    const updated = getTicket(ticket.id)!;
    const appointment = ticket.appointment_id ? getAppointment(ticket.appointment_id) : undefined;
    return ok(res, 200, {
      ticket: { id: updated.id, tokenNumber: updated.token_number, status: updated.status, position: updated.position },
      appointment: appointment ? shapeAppointment(appointment) : null,
    });
  })
);

const followUpSchema = z.object({ required: z.boolean(), notes: z.string().max(1000).optional() });

// --- POST /doctor/appointments/:id/follow-up ----------------------------------------------------------
router.post(
  "/appointments/:id/follow-up",
  ah(async (req, res) => {
    const parsed = followUpSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid request.", zodFieldErrors(parsed.error));
    const { doctorId, clinicId, userId } = doctorCtx(req);
    const appt = getAppointment(req.params.id);
    if (!appt || appt.doctor_id !== doctorId) return fail(res, 404, "NOT_FOUND", "Appointment not found.");
    const now = nowIso();
    db.prepare("UPDATE appointments SET follow_up_required = ?, follow_up_notes = ?, updated_at = ? WHERE id = ?").run(
      parsed.data.required ? 1 : 0,
      parsed.data.notes ?? null,
      now,
      appt.id
    );
    audit({
      clinicId,
      actorUserId: userId,
      entityType: "appointment",
      entityId: appt.id,
      action: "FOLLOW_UP_MARKED",
      newValues: { required: parsed.data.required, notes: parsed.data.notes ?? null },
      req,
    });
    return ok(res, 200, { appointment: shapeAppointment(getAppointment(appt.id)!) });
  })
);

export default router;
