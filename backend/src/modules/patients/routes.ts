import { randomUUID } from "crypto";
import { Router } from "express";
import { z } from "zod";
import { db, row, rows } from "../../db";
import { ah, fail, ok, zodFieldErrors } from "../../lib/http";
import { nowIso } from "../../lib/time";
import { requireAuth, requireRole } from "../../middleware/auth";
import { audit } from "../../services/audit";

const router = Router();
router.use(requireAuth, requireRole("PATIENT"));

interface ProfileRow {
  id: string;
  user_id: string | null;
  full_name: string;
  date_of_birth: string | null;
  gender: string | null;
  phone: string | null;
  email: string | null;
  relationship_to_account: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
}

function shape(p: ProfileRow) {
  return {
    id: p.id,
    fullName: p.full_name,
    phone: p.phone,
    dateOfBirth: p.date_of_birth,
    gender: p.gender,
    relationship: p.relationship_to_account,
    email: p.email,
    emergencyContactName: p.emergency_contact_name,
    emergencyContactPhone: p.emergency_contact_phone,
  };
}

function selfProfile(userId: string): ProfileRow | undefined {
  return row<ProfileRow>(
    `SELECT * FROM patient_profiles WHERE user_id = ?
     AND (relationship_to_account IS NULL OR relationship_to_account = 'SELF')
     ORDER BY created_at ASC LIMIT 1`,
    userId
  );
}

function ensureSelfProfile(userId: string, phone: string | null, name: string | null): ProfileRow {
  let p = selfProfile(userId);
  if (!p) {
    const now = nowIso();
    const id = randomUUID();
    db.prepare(
      `INSERT INTO patient_profiles (id, user_id, full_name, phone, relationship_to_account, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'SELF', ?, ?)`
    ).run(id, userId, name ?? "Patient", phone, now, now);
    p = row<ProfileRow>("SELECT * FROM patient_profiles WHERE id = ?", id)!;
  }
  return p;
}

router.get(
  "/me",
  ah(async (req, res) => {
    const u = req.user!;
    const p = ensureSelfProfile(u.id, u.phone, u.name);
    return ok(res, 200, { patient: shape(p) });
  })
);

const patchMeSchema = z.object({
  fullName: z.string().min(1).max(120).optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  gender: z.string().max(20).optional(),
  email: z.string().email().optional().nullable(),
  emergencyContactName: z.string().max(120).optional().nullable(),
  emergencyContactPhone: z.string().max(20).optional().nullable(),
});

router.patch(
  "/me",
  ah(async (req, res) => {
    const parsed = patchMeSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid request.", zodFieldErrors(parsed.error));
    const u = req.user!;
    const p = ensureSelfProfile(u.id, u.phone, u.name);
    const b = parsed.data;
    const now = nowIso();
    db.prepare(
      `UPDATE patient_profiles SET
         full_name = COALESCE(?, full_name),
         date_of_birth = COALESCE(?, date_of_birth),
         gender = COALESCE(?, gender),
         email = COALESCE(?, email),
         emergency_contact_name = COALESCE(?, emergency_contact_name),
         emergency_contact_phone = COALESCE(?, emergency_contact_phone),
         updated_at = ?
       WHERE id = ?`
    ).run(
      b.fullName ?? null,
      b.dateOfBirth ?? null,
      b.gender ?? null,
      b.email ?? null,
      b.emergencyContactName ?? null,
      b.emergencyContactPhone ?? null,
      now,
      p.id
    );
    // Keep the account display name in sync.
    if (b.fullName) db.prepare("UPDATE users SET name = ?, updated_at = ? WHERE id = ?").run(b.fullName, now, u.id);
    const updated = row<ProfileRow>("SELECT * FROM patient_profiles WHERE id = ?", p.id)!;
    return ok(res, 200, { patient: shape(updated) });
  })
);

router.get(
  "/me/family",
  ah(async (req, res) => {
    const u = req.user!;
    const family = rows<ProfileRow>(
      `SELECT * FROM patient_profiles WHERE user_id = ?
       AND relationship_to_account IS NOT NULL AND relationship_to_account != 'SELF'
       ORDER BY created_at ASC`,
      u.id
    );
    return ok(res, 200, { family: family.map(shape) });
  })
);

const familySchema = z.object({
  fullName: z.string().min(1).max(120),
  relationship: z.string().min(1).max(40),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  gender: z.string().max(20).optional(),
  phone: z.string().max(20).optional(),
});

router.post(
  "/me/family",
  ah(async (req, res) => {
    const parsed = familySchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid request.", zodFieldErrors(parsed.error));
    const u = req.user!;
    const b = parsed.data;
    const now = nowIso();
    const id = randomUUID();
    db.prepare(
      `INSERT INTO patient_profiles
         (id, user_id, full_name, date_of_birth, gender, phone, relationship_to_account, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, u.id, b.fullName, b.dateOfBirth ?? null, b.gender ?? null, b.phone ?? null, b.relationship, now, now);
    const created = row<ProfileRow>("SELECT * FROM patient_profiles WHERE id = ?", id)!;
    return ok(res, 201, { patient: shape(created) });
  })
);

function familyMemberOr404(userId: string, id: string): ProfileRow | undefined {
  return row<ProfileRow>(
    `SELECT * FROM patient_profiles WHERE id = ? AND user_id = ?
     AND relationship_to_account IS NOT NULL AND relationship_to_account != 'SELF'`,
    id,
    userId
  );
}

router.patch(
  "/me/family/:id",
  ah(async (req, res) => {
    const u = req.user!;
    const existing = familyMemberOr404(u.id, req.params.id);
    if (!existing) return fail(res, 404, "NOT_FOUND", "Family member not found.");
    const parsed = familySchema.partial().safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid request.", zodFieldErrors(parsed.error));
    const b = parsed.data;
    const now = nowIso();
    db.prepare(
      `UPDATE patient_profiles SET
         full_name = COALESCE(?, full_name),
         date_of_birth = COALESCE(?, date_of_birth),
         gender = COALESCE(?, gender),
         phone = COALESCE(?, phone),
         relationship_to_account = COALESCE(?, relationship_to_account),
         updated_at = ?
       WHERE id = ?`
    ).run(
      b.fullName ?? null,
      b.dateOfBirth ?? null,
      b.gender ?? null,
      b.phone ?? null,
      b.relationship ?? null,
      now,
      existing.id
    );
    audit({
      clinicId: staffClinicOf(u.id) ?? "",
      actorUserId: u.id,
      entityType: "patient",
      entityId: existing.id,
      action: "PATIENT_UPDATED",
      oldValues: shape(existing),
      req,
    });
    const updated = row<ProfileRow>("SELECT * FROM patient_profiles WHERE id = ?", existing.id)!;
    return ok(res, 200, { patient: shape(updated) });
  })
);

router.delete(
  "/me/family/:id",
  ah(async (req, res) => {
    const u = req.user!;
    const existing = familyMemberOr404(u.id, req.params.id);
    if (!existing) return fail(res, 404, "NOT_FOUND", "Family member not found.");
    const hasAppointments = row<{ c: number }>(
      "SELECT COUNT(*) AS c FROM appointments WHERE patient_id = ?",
      existing.id
    );
    if ((hasAppointments?.c ?? 0) > 0) {
      return fail(res, 400, "VALIDATION_ERROR", "Cannot remove a family member with appointment history.");
    }
    db.prepare("DELETE FROM patient_profiles WHERE id = ?").run(existing.id);
    return ok(res, 200, { ok: true });
  })
);

function staffClinicOf(userId: string): string | null {
  const r = row<{ clinic_id: string }>("SELECT clinic_id FROM clinic_staff WHERE user_id = ? LIMIT 1", userId);
  return r?.clinic_id ?? null;
}

export default router;
