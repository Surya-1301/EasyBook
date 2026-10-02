import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { db, row } from "../../db";
import { ah, fail, ok, zodFieldErrors } from "../../lib/http";
import { nowIso, localDate } from "../../lib/time";
import { requireAuth, requireRole, requireStaff } from "../../middleware/auth";
import { audit } from "../../services/audit";
import { callerPatientIds, getAppointment, shapeAppointment } from "../../services/appointments";
import {
  canTicketTransition,
  doctorDelayMinutes,
  getTicket,
  moveTicketToPosition,
  queueView,
  todayLocal,
} from "../../services/queue";

const router = Router();

// --- Staff/doctor queue operations ------------------------------------------------
router.get("/", requireAuth, requireRole("RECEPTIONIST", "CLINIC_ADMIN", "DOCTOR"), ah(async (req, res) => {
  const u = req.user!;
  let doctorId = (req.query.doctorId as string | undefined) ?? null;
  const date = (req.query.date as string | undefined) ?? null;

  if (u.role === "DOCTOR") {
    if (!u.doctorId) return fail(res, 403, "FORBIDDEN", "No doctor profile linked to this account.");
    doctorId = u.doctorId;
  }
  if (!doctorId) return fail(res, 400, "VALIDATION_ERROR", "doctorId is required.", { doctorId: "Required." });

  const doctor = row<{ clinic_id: string }>("SELECT clinic_id FROM doctors WHERE id = ?", doctorId);
  if (!doctor) return fail(res, 404, "NOT_FOUND", "Doctor not found.");
  if (u.role !== "DOCTOR" && doctor.clinic_id !== u.clinicId) {
    return fail(res, 403, "FORBIDDEN", "Doctor does not belong to your clinic.");
  }
  const tz = row<{ timezone: string }>("SELECT timezone FROM clinics WHERE id = ?", doctor.clinic_id)?.timezone ?? "Asia/Kolkata";
  const visitDate = date ?? todayLocal(tz);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(visitDate)) {
    return fail(res, 400, "VALIDATION_ERROR", "Invalid date.", { date: "Use format YYYY-MM-DD." });
  }
  return ok(res, 200, queueView(doctor.clinic_id, doctorId, visitDate));
}));

function transitionTicket(to: string) {
  return ah(async (req: Request, res: Response) => {
    const u = req.user!;
    const ticket = getTicket(req.params.id);
    if (!ticket) return fail(res, 404, "NOT_FOUND", "Queue ticket not found.");
    if (u.role === "DOCTOR") {
      if (!u.doctorId || ticket.doctor_id !== u.doctorId) return fail(res, 403, "FORBIDDEN", "Not your queue.");
    } else if (ticket.clinic_id !== u.clinicId) {
      return fail(res, 403, "FORBIDDEN", "Ticket does not belong to your clinic.");
    }
    if (!canTicketTransition(ticket.status, to)) {
      return fail(res, 400, "VALIDATION_ERROR", `Cannot move ticket from ${ticket.status} to ${to}.`);
    }
    const now = nowIso();
    const updates: Record<string, string | null> = { status: to, updated_at: now };
    if (to === "CALLED") updates.called_at = now;
    if (to === "IN_CONSULTATION") updates.consultation_started_at = now;
    if (to === "COMPLETED") updates.consultation_completed_at = now;
    const setClause = Object.keys(updates).map((k) => `${k} = ?`).join(", ");
    db.prepare(`UPDATE queue_tickets SET ${setClause} WHERE id = ?`).run(...Object.values(updates), ticket.id);

    // Mirror onto the linked appointment where it makes sense.
    if (ticket.appointment_id) {
      if (to === "IN_CONSULTATION") {
        db.prepare(`UPDATE appointments SET status = 'IN_CONSULTATION', consultation_started_at = ?, updated_at = ? WHERE id = ? AND status IN ('CHECKED_IN','WAITING','CONFIRMED','BOOKED')`).run(now, now, ticket.appointment_id);
      } else if (to === "COMPLETED") {
        db.prepare(`UPDATE appointments SET status = 'COMPLETED', consultation_completed_at = ?, updated_at = ? WHERE id = ? AND status IN ('IN_CONSULTATION','CHECKED_IN','WAITING')`).run(now, now, ticket.appointment_id);
      } else if (to === "NO_SHOW") {
        db.prepare(`UPDATE appointments SET status = 'NO_SHOW', updated_at = ? WHERE id = ? AND status IN ('CHECKED_IN','WAITING','CONFIRMED','BOOKED')`).run(now, ticket.appointment_id);
      } else if (to === "CANCELLED") {
        db.prepare(`UPDATE appointments SET status = 'CANCELLED', cancelled_at = ?, updated_at = ? WHERE id = ? AND status IN ('CHECKED_IN','WAITING','CONFIRMED','BOOKED')`).run(now, now, ticket.appointment_id);
      }
    }
    audit({
      clinicId: ticket.clinic_id,
      actorUserId: u.id,
      entityType: "queue_ticket",
      entityId: ticket.id,
      action: `QUEUE_TICKET_${to}`,
      oldValues: { status: ticket.status },
      newValues: { status: to },
      req,
    });
    const updated = getTicket(ticket.id)!;
    const appointment = ticket.appointment_id ? getAppointment(ticket.appointment_id) : undefined;
    return ok(res, 200, {
      ticket: {
        id: updated.id,
        tokenNumber: updated.token_number,
        status: updated.status,
        position: updated.position,
      },
      ...(appointment ? { appointment: shapeAppointment(appointment) } : {}),
    });
  });
}

router.post("/:id/call", requireAuth, requireRole("RECEPTIONIST", "CLINIC_ADMIN", "DOCTOR"), transitionTicket("CALLED"));
router.post(
  "/:id/recall",
  requireAuth,
  requireRole("RECEPTIONIST", "CLINIC_ADMIN", "DOCTOR"),
  ah(async (req, res) => {
    const u = req.user!;
    const ticket = getTicket(req.params.id);
    if (!ticket) return fail(res, 404, "NOT_FOUND", "Queue ticket not found.");
    if (u.role === "DOCTOR") {
      if (!u.doctorId || ticket.doctor_id !== u.doctorId) return fail(res, 403, "FORBIDDEN", "Not your queue.");
    } else if (ticket.clinic_id !== u.clinicId) {
      return fail(res, 403, "FORBIDDEN", "Ticket does not belong to your clinic.");
    }
    if (ticket.status !== "CALLED") {
      return fail(res, 400, "VALIDATION_ERROR", "Only a called ticket can be recalled.");
    }
    const now = nowIso();
    db.prepare("UPDATE queue_tickets SET called_at = ?, updated_at = ? WHERE id = ?").run(now, now, ticket.id);
    audit({
      clinicId: ticket.clinic_id,
      actorUserId: u.id,
      entityType: "queue_ticket",
      entityId: ticket.id,
      action: "QUEUE_TICKET_RECALLED",
      oldValues: { calledAt: ticket.called_at },
      newValues: { calledAt: now },
      req,
    });
    const updated = getTicket(ticket.id)!;
    return ok(res, 200, {
      ticket: { id: updated.id, tokenNumber: updated.token_number, status: updated.status, position: updated.position },
    });
  })
);
router.post("/:id/skip", requireAuth, requireRole("RECEPTIONIST", "CLINIC_ADMIN", "DOCTOR"), transitionTicket("SKIPPED"));
router.post("/:id/start", requireAuth, requireRole("RECEPTIONIST", "CLINIC_ADMIN", "DOCTOR"), transitionTicket("IN_CONSULTATION"));
router.post("/:id/complete", requireAuth, requireRole("RECEPTIONIST", "CLINIC_ADMIN", "DOCTOR"), transitionTicket("COMPLETED"));

const reorderSchema = z.object({
  ticketId: z.string().uuid(),
  newPosition: z.number().int().min(1),
  reason: z.string().min(3).max(500),
});

router.post("/reorder", requireAuth, requireStaff, ah(async (req, res) => {
  const parsed = reorderSchema.safeParse(req.body);
  if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "ticketId, newPosition and reason are required.", zodFieldErrors(parsed.error));
  const u = req.user!;
  const ticket = getTicket(parsed.data.ticketId);
  if (!ticket) return fail(res, 404, "NOT_FOUND", "Queue ticket not found.");
  if (ticket.clinic_id !== u.clinicId) return fail(res, 403, "FORBIDDEN", "Ticket does not belong to your clinic.");

  const oldPosition = ticket.position;
  moveTicketToPosition(ticket.id, parsed.data.newPosition);
  const updated = getTicket(ticket.id)!;

  audit({
    clinicId: ticket.clinic_id,
    actorUserId: u.id,
    entityType: "queue_ticket",
    entityId: ticket.id,
    action: "QUEUE_REORDERED",
    oldValues: { position: oldPosition },
    newValues: { position: updated.position, reason: parsed.data.reason },
    req,
  });
  return ok(res, 200, { ok: true });
}));

// --- Patient queue view -----------------------------------------------------------
const patientRouter = Router();
patientRouter.use(requireAuth, requireRole("PATIENT"));

patientRouter.get(
  "/my",
  ah(async (req, res) => {
    const u = req.user!;
    const appointmentId = req.query.appointmentId as string | undefined;
    if (!appointmentId) return fail(res, 400, "VALIDATION_ERROR", "appointmentId is required.");
    const appt = getAppointment(appointmentId);
    if (!appt) return fail(res, 404, "NOT_FOUND", "Appointment not found.");
    if (!callerPatientIds(u.id).includes(appt.patient_id)) {
      return fail(res, 403, "FORBIDDEN", "Not your appointment.");
    }
    const ticket = row<{ id: string; token_number: number; status: string; position: number }>(
      `SELECT id, token_number, status, position FROM queue_tickets WHERE appointment_id = ?
       ORDER BY created_at DESC LIMIT 1`,
      appointmentId
    );
    if (!ticket) return fail(res, 404, "NOT_FOUND", "No queue ticket for this appointment yet.");

    const clinic = row<{ timezone: string }>("SELECT timezone FROM clinics WHERE id = ?", appt.clinic_id);
    const tz = clinic?.timezone ?? "Asia/Kolkata";
    const visitDate = localDate(Date.parse(appt.start_at), tz);
    const view = queueView(appt.clinic_id, appt.doctor_id, visitDate);
    const mine = view.queue.find((t) => t.id === ticket.id);
    const patientsBefore = view.queue.filter(
      (t) => t.position < (mine?.position ?? 0) && ["WAITING", "CALLED"].includes(t.status)
    ).length;
    const doctor = row<{ name: string }>("SELECT name FROM doctors WHERE id = ?", appt.doctor_id);

    return ok(res, 200, {
      ticket: mine
        ? { id: mine.id, tokenNumber: mine.tokenNumber, status: mine.status, position: mine.position, estimatedWaitMinutes: mine.estimatedWaitMinutes }
        : null,
      nowServingToken: view.currentlyServing?.tokenNumber ?? null,
      patientsBefore,
      estimatedWaitMinutes: mine?.estimatedWaitMinutes ?? 0,
      doctorName: doctor?.name ?? "",
      appointmentTime: appt.start_at,
    });
  })
);

export { patientRouter };
export default router;
