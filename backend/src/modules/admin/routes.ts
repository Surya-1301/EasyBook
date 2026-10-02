import { randomUUID } from "crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db, row, rows } from "../../db";
import { ah, fail, ok, zodFieldErrors } from "../../lib/http";
import { localDate, nowIso } from "../../lib/time";
import { requireAuth, requireRole } from "../../middleware/auth";
import { DEFAULT_SETTINGS, mergeSettings, type ClinicSettings } from "../../types";
import { audit } from "../../services/audit";

const router = Router();
router.use(requireAuth, requireRole("CLINIC_ADMIN"));

function adminClinic(req: { user?: { clinicId: string | null } }): string {
  const c = req.user?.clinicId;
  if (!c) throw Object.assign(new Error("no clinic"), { httpCode: 403, errorCode: "FORBIDDEN" });
  return c;
}

function shapeClinicFull(c: Record<string, unknown>) {
  return {
    id: c.id,
    name: c.name,
    logoUrl: c.logo_url,
    description: c.description,
    phone: c.phone,
    email: c.email,
    addressLine1: c.address_line_1,
    addressLine2: c.address_line_2,
    city: c.city,
    state: c.state,
    postalCode: c.postal_code,
    latitude: c.latitude,
    longitude: c.longitude,
    timezone: c.timezone,
    status: c.status,
    settings: mergeSettings((c.settings as string | null) ?? null),
  };
}

// --- GET /admin/clinic -----------------------------------------------------------------
router.get(
  "/clinic",
  ah(async (req, res) => {
    const clinic = row<Record<string, unknown>>("SELECT * FROM clinics WHERE id = ?", adminClinic(req));
    if (!clinic) return fail(res, 404, "NOT_FOUND", "Clinic not found.");
    return ok(res, 200, { clinic: shapeClinicFull(clinic) });
  })
);

const clinicPatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  logoUrl: z.string().max(2000).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
  phone: z.string().max(20).optional(),
  email: z.string().email().optional().nullable(),
  addressLine1: z.string().max(300).optional(),
  addressLine2: z.string().max(300).optional().nullable(),
  city: z.string().max(120).optional(),
  state: z.string().max(120).optional(),
  postalCode: z.string().max(20).optional(),
  settings: z
    .object({
      booking: z
        .object({
          maxAdvanceDays: z.number().int().min(1).max(365).optional(),
          minAdvanceMinutes: z.number().int().min(0).max(1440).optional(),
          cancellationCutoffMinutes: z.number().int().min(0).max(10080).optional(),
          rescheduleCutoffMinutes: z.number().int().min(0).max(10080).optional(),
          autoConfirm: z.boolean().optional(),
        })
        .optional(),
      queue: z
        .object({ walkInsEnabled: z.boolean().optional(), patientSelfCheckInEnabled: z.boolean().optional() })
        .optional(),
      notifications: z
        .object({
          confirmationEnabled: z.boolean().optional(),
          reminderEnabled: z.boolean().optional(),
          delayNotificationEnabled: z.boolean().optional(),
        })
        .optional(),
    })
    .optional(),
});

// --- PATCH /admin/clinic -----------------------------------------------------------------
router.patch(
  "/clinic",
  ah(async (req, res) => {
    const parsed = clinicPatchSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid request.", zodFieldErrors(parsed.error));
    const u = req.user!;
    const clinicId = adminClinic(req);
    const before = row<Record<string, unknown>>("SELECT * FROM clinics WHERE id = ?", clinicId)!;
    const b = parsed.data;
    const now = nowIso();

    let settingsJson: string | null = null;
    if (b.settings) {
      const merged = mergeSettings((before.settings as string | null) ?? null);
      const next: ClinicSettings = {
        booking: { ...merged.booking, ...(b.settings.booking ?? {}) },
        queue: { ...merged.queue, ...(b.settings.queue ?? {}) },
        notifications: { ...merged.notifications, ...(b.settings.notifications ?? {}) },
      };
      settingsJson = JSON.stringify(next);
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    const set = (col: string, v: unknown) => {
      if (v !== undefined) {
        fields.push(`${col} = ?`);
        values.push(v);
      }
    };
    set("name", b.name);
    set("logo_url", b.logoUrl);
    set("description", b.description);
    set("phone", b.phone);
    set("email", b.email);
    set("address_line_1", b.addressLine1);
    set("address_line_2", b.addressLine2);
    set("city", b.city);
    set("state", b.state);
    set("postal_code", b.postalCode);
    if (settingsJson) {
      fields.push("settings = ?");
      values.push(settingsJson);
    }
    if (fields.length > 0) {
      fields.push("updated_at = ?");
      values.push(now);
      db.prepare(`UPDATE clinics SET ${fields.join(", ")} WHERE id = ?`).run(...values, clinicId);
    }
    const after = row<Record<string, unknown>>("SELECT * FROM clinics WHERE id = ?", clinicId)!;
    audit({
      clinicId,
      actorUserId: u.id,
      entityType: "clinic",
      entityId: clinicId,
      action: "CLINIC_UPDATED",
      oldValues: shapeClinicFull(before),
      newValues: shapeClinicFull(after),
      req,
    });
    return ok(res, 200, { clinic: shapeClinicFull(after) });
  })
);

function shapeDoctor(d: Record<string, unknown>) {
  return {
    id: d.id,
    name: d.name,
    specialty: d.specialty,
    qualification: d.qualification,
    experienceYears: d.experience_years,
    languages: d.languages ? JSON.parse(d.languages as string) : [],
    bio: d.bio,
    photoUrl: d.photo_url,
    consultationFee: d.consultation_fee,
    status: d.status,
    userId: d.user_id,
  };
}

const doctorSchema = z.object({
  name: z.string().min(1).max(120),
  specialty: z.string().min(1).max(120),
  qualification: z.string().max(500).optional().nullable(),
  experienceYears: z.number().int().min(0).max(80).optional().nullable(),
  languages: z.array(z.string().max(40)).optional(),
  bio: z.string().max(2000).optional().nullable(),
  photoUrl: z.string().max(2000).optional().nullable(),
  consultationFee: z.number().min(0).optional().nullable(),
  userId: z.string().uuid().optional().nullable(),
  serviceIds: z.array(z.string().uuid()).optional(),
});

// --- Doctors CRUD ----------------------------------------------------------------------------
router.get(
  "/doctors",
  ah(async (req, res) => {
    const clinicId = adminClinic(req);
    const doctors = rows<Record<string, unknown>>("SELECT * FROM doctors WHERE clinic_id = ? ORDER BY name ASC", clinicId);
    return ok(res, 200, { doctors: doctors.map(shapeDoctor) });
  })
);

router.post(
  "/doctors",
  ah(async (req, res) => {
    const parsed = doctorSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid request.", zodFieldErrors(parsed.error));
    const u = req.user!;
    const clinicId = adminClinic(req);
    const b = parsed.data;
    const now = nowIso();
    const id = randomUUID();
    db.transaction(() => {
      db.prepare(
        `INSERT INTO doctors
           (id, clinic_id, user_id, name, specialty, qualification, experience_years, languages, bio, photo_url, consultation_fee, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`
      ).run(
        id,
        clinicId,
        b.userId ?? null,
        b.name,
        b.specialty,
        b.qualification ?? null,
        b.experienceYears ?? null,
        b.languages ? JSON.stringify(b.languages) : null,
        b.bio ?? null,
        b.photoUrl ?? null,
        b.consultationFee ?? null,
        now,
        now
      );
      if (b.serviceIds) {
        const stmt = db.prepare("INSERT OR IGNORE INTO doctor_services (doctor_id, service_id) VALUES (?, ?)");
        for (const sid of b.serviceIds) stmt.run(id, sid);
      }
    })();
    audit({ clinicId, actorUserId: u.id, entityType: "doctor", entityId: id, action: "DOCTOR_CREATED", newValues: b, req });
    const created = row<Record<string, unknown>>("SELECT * FROM doctors WHERE id = ?", id)!;
    return ok(res, 201, { doctor: shapeDoctor(created) });
  })
);

router.patch(
  "/doctors/:id",
  ah(async (req, res) => {
    const parsed = doctorSchema.partial().safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid request.", zodFieldErrors(parsed.error));
    const u = req.user!;
    const clinicId = adminClinic(req);
    const before = row<Record<string, unknown>>("SELECT * FROM doctors WHERE id = ? AND clinic_id = ?", req.params.id, clinicId);
    if (!before) return fail(res, 404, "NOT_FOUND", "Doctor not found.");
    const b = parsed.data;
    const now = nowIso();
    const fields: string[] = [];
    const values: unknown[] = [];
    const set = (col: string, v: unknown) => {
      if (v !== undefined) {
        fields.push(`${col} = ?`);
        values.push(v);
      }
    };
    set("name", b.name);
    set("specialty", b.specialty);
    set("qualification", b.qualification);
    set("experience_years", b.experienceYears);
    set("languages", b.languages ? JSON.stringify(b.languages) : undefined);
    set("bio", b.bio);
    set("photo_url", b.photoUrl);
    set("consultation_fee", b.consultationFee);
    set("user_id", b.userId);
    db.transaction(() => {
      if (fields.length > 0) {
        fields.push("updated_at = ?");
        values.push(now);
        db.prepare(`UPDATE doctors SET ${fields.join(", ")} WHERE id = ?`).run(...values, before.id);
      }
      if (b.serviceIds) {
        db.prepare("DELETE FROM doctor_services WHERE doctor_id = ?").run(before.id);
        const stmt = db.prepare("INSERT OR IGNORE INTO doctor_services (doctor_id, service_id) VALUES (?, ?)");
        for (const sid of b.serviceIds) stmt.run(before.id, sid);
      }
    })();
    const after = row<Record<string, unknown>>("SELECT * FROM doctors WHERE id = ?", before.id)!;
    audit({ clinicId, actorUserId: u.id, entityType: "doctor", entityId: before.id as string, action: "DOCTOR_UPDATED", oldValues: shapeDoctor(before), newValues: shapeDoctor(after), req });
    return ok(res, 200, { doctor: shapeDoctor(after) });
  })
);

const doctorStatusSchema = z.object({ status: z.enum(["ACTIVE", "INACTIVE"]) });

router.patch(
  "/doctors/:id/status",
  ah(async (req, res) => {
    const parsed = doctorStatusSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid request.", zodFieldErrors(parsed.error));
    const u = req.user!;
    const clinicId = adminClinic(req);
    const doctor = row<Record<string, unknown>>("SELECT * FROM doctors WHERE id = ? AND clinic_id = ?", req.params.id, clinicId);
    if (!doctor) return fail(res, 404, "NOT_FOUND", "Doctor not found.");
    const now = nowIso();
    db.prepare("UPDATE doctors SET status = ?, updated_at = ? WHERE id = ?").run(parsed.data.status, now, doctor.id);
    audit({
      clinicId,
      actorUserId: u.id,
      entityType: "doctor",
      entityId: doctor.id as string,
      action: "DOCTOR_STATUS_CHANGED",
      oldValues: { status: doctor.status },
      newValues: { status: parsed.data.status },
      req,
    });
    const after = row<Record<string, unknown>>("SELECT * FROM doctors WHERE id = ?", doctor.id)!;
    return ok(res, 200, { doctor: shapeDoctor(after) });
  })
);

// --- Schedules ------------------------------------------------------------------------------------
const scheduleItemSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  breakStartTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  breakEndTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  slotDurationMinutes: z.number().int().min(5).max(240).optional().nullable(),
});

router.get(
  "/doctors/:id/schedule",
  ah(async (req, res) => {
    const clinicId = adminClinic(req);
    const doctor = row("SELECT id FROM doctors WHERE id = ? AND clinic_id = ?", req.params.id, clinicId);
    if (!doctor) return fail(res, 404, "NOT_FOUND", "Doctor not found.");
    const recurring = rows<Record<string, unknown>>(
      "SELECT * FROM recurring_schedules WHERE doctor_id = ? AND status = 'ACTIVE' ORDER BY day_of_week, start_time",
      req.params.id
    ).map((r) => ({
      id: r.id,
      dayOfWeek: r.day_of_week,
      startTime: (r.start_time as string).slice(0, 5),
      endTime: (r.end_time as string).slice(0, 5),
      breakStartTime: r.break_start_time ? (r.break_start_time as string).slice(0, 5) : null,
      breakEndTime: r.break_end_time ? (r.break_end_time as string).slice(0, 5) : null,
      slotDurationMinutes: r.slot_duration_minutes,
      effectiveFrom: r.effective_from,
      effectiveTo: r.effective_to,
    }));
    const exceptions = rows<Record<string, unknown>>(
      "SELECT * FROM schedule_exceptions WHERE doctor_id = ? ORDER BY date DESC LIMIT 100",
      req.params.id
    ).map((e) => ({
      id: e.id,
      date: e.date,
      type: e.type,
      startTime: e.start_time ? (e.start_time as string).slice(0, 5) : null,
      endTime: e.end_time ? (e.end_time as string).slice(0, 5) : null,
      reason: e.reason,
      createdAt: e.created_at,
    }));
    return ok(res, 200, { recurring, exceptions });
  })
);

const scheduleReplaceSchema = z.object({ schedules: z.array(scheduleItemSchema).min(1) });

router.post(
  "/doctors/:id/schedule",
  ah(async (req, res) => {
    const parsed = scheduleReplaceSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid request.", zodFieldErrors(parsed.error));
    const u = req.user!;
    const clinicId = adminClinic(req);
    const doctor = row("SELECT id FROM doctors WHERE id = ? AND clinic_id = ?", req.params.id, clinicId);
    if (!doctor) return fail(res, 404, "NOT_FOUND", "Doctor not found.");

    for (const s of parsed.data.schedules) {
      if (s.startTime >= s.endTime) {
        return fail(res, 400, "VALIDATION_ERROR", "endTime must be after startTime.", { endTime: "Must be after startTime." });
      }
    }

    const before = rows("SELECT * FROM recurring_schedules WHERE doctor_id = ? AND status = 'ACTIVE'", req.params.id);
    const now = nowIso();
    const effectiveFrom = localDate(Date.now(), "Asia/Kolkata");
    db.transaction(() => {
      db.prepare("DELETE FROM recurring_schedules WHERE doctor_id = ?").run(req.params.id);
      const stmt = db.prepare(
        `INSERT INTO recurring_schedules
           (id, doctor_id, day_of_week, start_time, end_time, break_start_time, break_end_time,
            slot_duration_minutes, effective_from, effective_to, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'ACTIVE', ?, ?)`
      );
      for (const s of parsed.data.schedules) {
        stmt.run(
          randomUUID(),
          req.params.id,
          s.dayOfWeek,
          s.startTime,
          s.endTime,
          s.breakStartTime ?? null,
          s.breakEndTime ?? null,
          s.slotDurationMinutes ?? null,
          effectiveFrom,
          now,
          now
        );
      }
    })();

    // Surface existing upcoming appointments that now fall outside the new windows.
    const upcoming = rows<{ id: string; start_at: string }>(
      `SELECT id, start_at FROM appointments WHERE doctor_id = ?
         AND status IN ('BOOKED','CONFIRMED') AND start_at >= ? ORDER BY start_at ASC LIMIT 200`,
      req.params.id,
      now
    );
    const tz = row<{ timezone: string }>("SELECT timezone FROM clinics WHERE id = ?", clinicId)?.timezone ?? "Asia/Kolkata";
    const windowsByDay = new Map<number, Array<{ start: string; end: string }>>();
    for (const s of parsed.data.schedules) {
      const arr = windowsByDay.get(s.dayOfWeek) ?? [];
      arr.push({ start: s.startTime, end: s.endTime });
      windowsByDay.set(s.dayOfWeek, arr);
    }
    const conflicts = upcoming.filter((a) => {
      const ms = Date.parse(a.start_at);
      const dow = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(new Date(ms));
      const dayIdx = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(dow);
      const wins = windowsByDay.get(dayIdx) ?? [];
      const hhmm = new Date(ms).toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
      return !wins.some((w) => hhmm >= w.start && hhmm < w.end);
    });

    audit({
      clinicId,
      actorUserId: u.id,
      entityType: "doctor",
      entityId: req.params.id,
      action: "SCHEDULE_CHANGED",
      oldValues: { count: before.length },
      newValues: { schedules: parsed.data.schedules },
      req,
    });
    const recurring = rows<Record<string, unknown>>("SELECT * FROM recurring_schedules WHERE doctor_id = ? AND status = 'ACTIVE'", req.params.id);
    return ok(res, 200, {
      recurring: recurring.map((r: Record<string, unknown>) => ({
        id: r.id,
        dayOfWeek: r.day_of_week,
        startTime: (r.start_time as string).slice(0, 5),
        endTime: (r.end_time as string).slice(0, 5),
      })),
      conflicts: conflicts.map((c) => ({ appointmentId: c.id, startAt: c.start_at })),
    });
  })
);

const exceptionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(["LEAVE", "BLOCK", "CUSTOM_HOURS", "EXTRA_HOURS"]),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  reason: z.string().max(500).optional().nullable(),
});

router.post(
  "/doctors/:id/exceptions",
  ah(async (req, res) => {
    const parsed = exceptionSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid request.", zodFieldErrors(parsed.error));
    const u = req.user!;
    const clinicId = adminClinic(req);
    const doctor = row("SELECT id FROM doctors WHERE id = ? AND clinic_id = ?", req.params.id, clinicId);
    if (!doctor) return fail(res, 404, "NOT_FOUND", "Doctor not found.");
    const b = parsed.data;
    if (b.type !== "LEAVE") {
      if (!b.startTime || !b.endTime) {
        return fail(res, 400, "VALIDATION_ERROR", "startTime and endTime are required for this exception type.");
      }
      if (b.startTime >= b.endTime) {
        return fail(res, 400, "VALIDATION_ERROR", "endTime must be after startTime.");
      }
    }
    const now = nowIso();
    const id = randomUUID();
    db.prepare(
      `INSERT INTO schedule_exceptions (id, doctor_id, date, type, start_time, end_time, reason, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, req.params.id, b.date, b.type, b.startTime ?? null, b.endTime ?? null, b.reason ?? null, u.id, now);
    audit({
      clinicId,
      actorUserId: u.id,
      entityType: "schedule_exception",
      entityId: id,
      action: "EXCEPTION_ADDED",
      newValues: b,
      req,
    });
    return ok(res, 201, {
      exception: { id, doctorId: req.params.id, date: b.date, type: b.type, startTime: b.startTime ?? null, endTime: b.endTime ?? null, reason: b.reason ?? null, createdAt: now },
    });
  })
);

router.delete(
  "/doctors/:id/exceptions/:exceptionId",
  ah(async (req, res) => {
    const u = req.user!;
    const clinicId = adminClinic(req);
    const doctor = row("SELECT id FROM doctors WHERE id = ? AND clinic_id = ?", req.params.id, clinicId);
    if (!doctor) return fail(res, 404, "NOT_FOUND", "Doctor not found.");
    const ex = row<Record<string, unknown>>("SELECT * FROM schedule_exceptions WHERE id = ? AND doctor_id = ?", req.params.exceptionId, req.params.id);
    if (!ex) return fail(res, 404, "NOT_FOUND", "Exception not found.");
    db.prepare("DELETE FROM schedule_exceptions WHERE id = ?").run(ex.id);
    audit({ clinicId, actorUserId: u.id, entityType: "schedule_exception", entityId: ex.id as string, action: "EXCEPTION_REMOVED", oldValues: ex, req });
    return ok(res, 200, { ok: true });
  })
);

// --- Services CRUD -------------------------------------------------------------------------------------
const serviceSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1000).optional().nullable(),
  durationMinutes: z.number().int().min(5).max(240),
  fee: z.number().min(0).optional().nullable(),
});

function shapeService(s: Record<string, unknown>) {
  return { id: s.id, name: s.name, description: s.description, durationMinutes: s.duration_minutes, fee: s.fee, status: s.status };
}

router.get(
  "/services",
  ah(async (req, res) => {
    const clinicId = adminClinic(req);
    const services = rows<Record<string, unknown>>("SELECT * FROM services WHERE clinic_id = ? ORDER BY name ASC", clinicId);
    return ok(res, 200, { services: services.map(shapeService) });
  })
);

router.post(
  "/services",
  ah(async (req, res) => {
    const parsed = serviceSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid request.", zodFieldErrors(parsed.error));
    const u = req.user!;
    const clinicId = adminClinic(req);
    const b = parsed.data;
    const now = nowIso();
    const id = randomUUID();
    db.prepare(
      `INSERT INTO services (id, clinic_id, name, description, duration_minutes, fee, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`
    ).run(id, clinicId, b.name, b.description ?? null, b.durationMinutes, b.fee ?? null, now, now);
    audit({ clinicId, actorUserId: u.id, entityType: "service", entityId: id, action: "SERVICE_CREATED", newValues: b, req });
    const created = row<Record<string, unknown>>("SELECT * FROM services WHERE id = ?", id)!;
    return ok(res, 201, { service: shapeService(created) });
  })
);

router.patch(
  "/services/:id",
  ah(async (req, res) => {
    const parsed = serviceSchema.partial().safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid request.", zodFieldErrors(parsed.error));
    const u = req.user!;
    const clinicId = adminClinic(req);
    const before = row<Record<string, unknown>>("SELECT * FROM services WHERE id = ? AND clinic_id = ?", req.params.id, clinicId);
    if (!before) return fail(res, 404, "NOT_FOUND", "Service not found.");
    const b = parsed.data;
    const now = nowIso();
    db.prepare(
      `UPDATE services SET name = COALESCE(?, name), description = COALESCE(?, description),
         duration_minutes = COALESCE(?, duration_minutes), fee = COALESCE(?, fee), updated_at = ? WHERE id = ?`
    ).run(b.name ?? null, b.description ?? null, b.durationMinutes ?? null, b.fee ?? null, now, before.id);
    const after = row<Record<string, unknown>>("SELECT * FROM services WHERE id = ?", before.id)!;
    audit({ clinicId, actorUserId: u.id, entityType: "service", entityId: before.id as string, action: "SERVICE_UPDATED", oldValues: shapeService(before), newValues: shapeService(after), req });
    return ok(res, 200, { service: shapeService(after) });
  })
);

router.delete(
  "/services/:id",
  ah(async (req, res) => {
    const u = req.user!;
    const clinicId = adminClinic(req);
    const svc = row<Record<string, unknown>>("SELECT * FROM services WHERE id = ? AND clinic_id = ?", req.params.id, clinicId);
    if (!svc) return fail(res, 404, "NOT_FOUND", "Service not found.");
    const inUse = row<{ c: number }>("SELECT COUNT(*) AS c FROM appointments WHERE service_id = ?", svc.id);
    if ((inUse?.c ?? 0) > 0) {
      db.prepare("UPDATE services SET status = 'INACTIVE', updated_at = ? WHERE id = ?").run(nowIso(), svc.id);
    } else {
      db.prepare("DELETE FROM doctor_services WHERE service_id = ?").run(svc.id);
      db.prepare("DELETE FROM services WHERE id = ?").run(svc.id);
    }
    audit({ clinicId, actorUserId: u.id, entityType: "service", entityId: svc.id as string, action: "SERVICE_DELETED", oldValues: shapeService(svc), req });
    return ok(res, 200, { ok: true });
  })
);

// --- Staff CRUD ------------------------------------------------------------------------------------------
const staffSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().optional().nullable(),
  phone: z.string().min(10).max(15),
  password: z.string().min(6).max(100),
  role: z.enum(["RECEPTIONIST", "CLINIC_ADMIN", "DOCTOR"]),
});

function shapeStaff(r: Record<string, unknown>) {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    role: r.role,
    status: r.status,
    createdAt: r.created_at,
  };
}

router.get(
  "/staff",
  ah(async (req, res) => {
    const clinicId = adminClinic(req);
    const staff = rows<Record<string, unknown>>(
      `SELECT cs.id, cs.user_id, u.name, u.email, u.phone, cs.role, cs.status, cs.created_at
       FROM clinic_staff cs JOIN users u ON u.id = cs.user_id
       WHERE cs.clinic_id = ? ORDER BY cs.created_at ASC`,
      clinicId
    );
    return ok(res, 200, { staff: staff.map(shapeStaff) });
  })
);

router.post(
  "/staff",
  ah(async (req, res) => {
    const parsed = staffSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid request.", zodFieldErrors(parsed.error));
    const u = req.user!;
    const clinicId = adminClinic(req);
    const b = parsed.data;

    const dupe = row("SELECT id FROM users WHERE email = ? OR phone = ?", b.email ?? `__none_${Date.now()}`, b.phone);
    if (dupe) return fail(res, 400, "VALIDATION_ERROR", "A user with this email or phone already exists.");

    const now = nowIso();
    const userId = randomUUID();
    const staffId = randomUUID();
    const passwordHash = await bcrypt.hash(b.password, 10);
    db.transaction(() => {
      db.prepare(
        `INSERT INTO users (id, phone, email, password_hash, role, name, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`
      ).run(userId, b.phone, b.email ?? null, passwordHash, b.role, b.name, now, now);
      db.prepare(
        `INSERT INTO clinic_staff (id, clinic_id, user_id, role, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)`
      ).run(staffId, clinicId, userId, b.role, now, now);
    })();
    audit({ clinicId, actorUserId: u.id, entityType: "staff", entityId: staffId, action: "STAFF_CREATED", newValues: { name: b.name, role: b.role }, req });
    const created = row<Record<string, unknown>>(
      `SELECT cs.id, cs.user_id, u.name, u.email, u.phone, cs.role, cs.status, cs.created_at
       FROM clinic_staff cs JOIN users u ON u.id = cs.user_id WHERE cs.id = ?`,
      staffId
    )!;
    return ok(res, 201, { staff: shapeStaff(created) });
  })
);

const staffPatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().min(10).max(15).optional(),
  password: z.string().min(6).max(100).optional(),
  role: z.enum(["RECEPTIONIST", "CLINIC_ADMIN", "DOCTOR"]).optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
});

router.patch(
  "/staff/:id",
  ah(async (req, res) => {
    const parsed = staffPatchSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid request.", zodFieldErrors(parsed.error));
    const u = req.user!;
    const clinicId = adminClinic(req);
    const staff = row<{ id: string; user_id: string; role: string; status: string }>(
      "SELECT id, user_id, role, status FROM clinic_staff WHERE id = ? AND clinic_id = ?",
      req.params.id,
      clinicId
    );
    if (!staff) return fail(res, 404, "NOT_FOUND", "Staff member not found.");
    if (staff.user_id === u.id && (parsed.data.status === "INACTIVE" || parsed.data.role)) {
      return fail(res, 400, "VALIDATION_ERROR", "You cannot change your own role or deactivate yourself.");
    }
    const b = parsed.data;
    const now = nowIso();
    db.transaction(() => {
      const uFields: string[] = [];
      const uValues: unknown[] = [];
      if (b.name !== undefined) { uFields.push("name = ?"); uValues.push(b.name); }
      if (b.email !== undefined) { uFields.push("email = ?"); uValues.push(b.email); }
      if (b.phone !== undefined) { uFields.push("phone = ?"); uValues.push(b.phone); }
      if (b.role !== undefined) { uFields.push("role = ?"); uValues.push(b.role); }
      if (uFields.length > 0) {
        uFields.push("updated_at = ?");
        uValues.push(now);
        db.prepare(`UPDATE users SET ${uFields.join(", ")} WHERE id = ?`).run(...uValues, staff.user_id);
      }
      const sFields: string[] = [];
      const sValues: unknown[] = [];
      if (b.role !== undefined) { sFields.push("role = ?"); sValues.push(b.role); }
      if (b.status !== undefined) { sFields.push("status = ?"); sValues.push(b.status); }
      if (sFields.length > 0) {
        sFields.push("updated_at = ?");
        sValues.push(now);
        db.prepare(`UPDATE clinic_staff SET ${sFields.join(", ")} WHERE id = ?`).run(...sValues, staff.id);
      }
    })();
    if (b.password) {
      const hash = await bcrypt.hash(b.password, 10);
      db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(hash, nowIso(), staff.user_id);
    }
    audit({ clinicId, actorUserId: u.id, entityType: "staff", entityId: staff.id, action: "STAFF_UPDATED", newValues: { ...b, password: b.password ? "***" : undefined }, req });
    return ok(res, 200, { ok: true });
  })
);

// --- Reports -----------------------------------------------------------------------------------------------
router.get(
  "/reports/today",
  ah(async (req, res) => {
    const clinicId = adminClinic(req);
    const tz = row<{ timezone: string }>("SELECT timezone FROM clinics WHERE id = ?", clinicId)?.timezone ?? "Asia/Kolkata";
    const date = (req.query.date as string | undefined) ?? localDate(Date.now(), tz);

    const list = rows<{ id: string; doctor_id: string; status: string; start_at: string; service_id: string }>(
      `SELECT a.id, a.doctor_id, a.status, a.start_at, a.service_id FROM appointments a
       JOIN doctors d ON d.id = a.doctor_id
       WHERE d.clinic_id = ? AND a.status != 'EXPIRED'`,
      clinicId
    ).filter((a) => localDate(Date.parse(a.start_at), tz) === date);

    const doctors = rows<{ id: string; name: string }>("SELECT id, name FROM doctors WHERE clinic_id = ?", clinicId);
    const paidByAppt = new Map<string, number>();
    for (const p of rows<{ appointment_id: string; amount: number }>(
      "SELECT appointment_id, amount FROM payments WHERE status = 'PAID'"
    )) {
      paidByAppt.set(p.appointment_id, (paidByAppt.get(p.appointment_id) ?? 0) + p.amount);
    }

    const count = (s: string) => list.filter((a) => a.status === s).length;
    const byDoctor = doctors.map((d) => {
      const mine = list.filter((a) => a.doctor_id === d.id);
      return {
        doctorId: d.id,
        doctorName: d.name,
        total: mine.length,
        completed: mine.filter((a) => a.status === "COMPLETED").length,
        cancelled: mine.filter((a) => a.status === "CANCELLED").length,
        noShow: mine.filter((a) => a.status === "NO_SHOW").length,
        collected: Math.round(mine.reduce((sum, a) => sum + (paidByAppt.get(a.id) ?? 0), 0)),
      };
    });

    return ok(res, 200, {
      date,
      stats: {
        total: list.length,
        completed: count("COMPLETED"),
        cancelled: count("CANCELLED"),
        noShow: count("NO_SHOW"),
        checkedIn: count("CHECKED_IN"),
        waiting: count("WAITING"),
      },
      byDoctor,
    });
  })
);

// --- Audit logs ----------------------------------------------------------------------------------------------
router.get(
  "/audit-logs",
  ah(async (req, res) => {
    const clinicId = adminClinic(req);
    const limit = Math.min(Math.max(Number(req.query.limit ?? 50) || 50, 1), 500);
    const logs = rows<Record<string, unknown>>(
      `SELECT l.*, u.name AS actor_name FROM audit_logs l
       LEFT JOIN users u ON u.id = l.actor_user_id
       WHERE l.clinic_id = ? ORDER BY l.created_at DESC LIMIT ?`,
      clinicId,
      limit
    ).map((l) => ({
      id: l.id,
      actorUserId: l.actor_user_id,
      actorName: l.actor_name,
      entityType: l.entity_type,
      entityId: l.entity_id,
      action: l.action,
      oldValues: l.old_values ? JSON.parse(l.old_values as string) : null,
      newValues: l.new_values ? JSON.parse(l.new_values as string) : null,
      ipAddress: l.ip_address,
      createdAt: l.created_at,
    }));
    return ok(res, 200, { logs });
  })
);

export default router;
export { DEFAULT_SETTINGS };
