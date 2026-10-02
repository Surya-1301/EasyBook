import { createHash, randomInt, randomUUID, timingSafeEqual } from "crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db, row, rows } from "../../db";
import { ah, fail, ok, zodFieldErrors } from "../../lib/http";
import { nowIso } from "../../lib/time";
import { signToken, requireAuth } from "../../middleware/auth";
import { config } from "../../config";

const router = Router();

const OTP_TTL_SECONDS = 300;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RATE_LIMIT_WINDOW_MIN = 15;
const OTP_RATE_LIMIT_MAX = 5;

// Demo patient login (dev only): DEMO_PHONE can verify with DEMO_PASSWORD as
// the OTP, so the patient app is testable without an SMS provider.
// Automatically disabled when NODE_ENV=production; set DEMO_LOGIN_ENABLED=false
// to turn it off explicitly.
const DEMO_PHONE = (process.env.DEMO_PHONE || "").trim() || "9616398313";
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "123456";
const demoLoginEnabled =
  process.env.DEMO_LOGIN_ENABLED !== "false" && config.nodeEnv !== "production";

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  const stripped = digits.startsWith("91") && digits.length === 12 ? digits.slice(2) : digits;
  if (stripped.startsWith("0") && stripped.length === 11) return stripped.slice(1);
  return /^\d{10}$/.test(stripped) ? stripped : null;
}

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

const requestOtpSchema = z.object({ phone: z.string().min(6) });

router.post(
  "/request-otp",
  ah(async (req, res) => {
    const parsed = requestOtpSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid request.", zodFieldErrors(parsed.error));
    const phone = normalizePhone(parsed.data.phone);
    if (!phone) return fail(res, 400, "VALIDATION_ERROR", "Enter a valid 10-digit mobile number.", { phone: "Invalid phone number." });

    const since = new Date(Date.now() - OTP_RATE_LIMIT_WINDOW_MIN * 60 * 1000).toISOString();
    const recent = row<{ c: number }>(
      "SELECT COUNT(*) AS c FROM otp_verifications WHERE phone = ? AND created_at >= ?",
      phone,
      since
    );
    if ((recent?.c ?? 0) >= OTP_RATE_LIMIT_MAX) {
      return fail(res, 429, "RATE_LIMITED", "Too many OTP requests. Please try again later.");
    }

    const code = String(randomInt(100000, 1000000));
    const now = nowIso();
    db.prepare(
      `INSERT INTO otp_verifications (id, phone, code_hash, expires_at, attempts, used, created_at)
       VALUES (?, ?, ?, ?, 0, 0, ?)`
    ).run(randomUUID(), phone, hashCode(code), new Date(Date.now() + OTP_TTL_SECONDS * 1000).toISOString(), now);

    console.log(`[auth] OTP requested for ${phone}`);
    return ok(res, 200, {
      ok: true,
      expiresInSeconds: OTP_TTL_SECONDS,
    });
  })
);

const verifyOtpSchema = z.object({ phone: z.string().min(6), code: z.string().length(6) });

router.post(
  "/verify-otp",
  ah(async (req, res) => {
    const parsed = verifyOtpSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid request.", zodFieldErrors(parsed.error));
    const phone = normalizePhone(parsed.data.phone);
    if (!phone) return fail(res, 400, "VALIDATION_ERROR", "Enter a valid 10-digit mobile number.");

    const isDemoBypass = demoLoginEnabled && phone === DEMO_PHONE && parsed.data.code === DEMO_PASSWORD;

    if (!isDemoBypass) {
    const otp = row<{ id: string; code_hash: string; expires_at: string; attempts: number; used: number }>(
      `SELECT id, code_hash, expires_at, attempts, used FROM otp_verifications
       WHERE phone = ? AND used = 0 ORDER BY created_at DESC LIMIT 1`,
      phone
    );
    if (!otp) return fail(res, 400, "VALIDATION_ERROR", "No active OTP found. Please request a new code.");
    if (otp.expires_at < nowIso()) return fail(res, 400, "VALIDATION_ERROR", "OTP has expired. Please request a new code.");
    if (otp.attempts >= OTP_MAX_ATTEMPTS) {
      db.prepare("UPDATE otp_verifications SET used = 1 WHERE id = ?").run(otp.id);
      return fail(res, 429, "RATE_LIMITED", "Too many incorrect attempts. Please request a new code.");
    }

    const a = Buffer.from(hashCode(parsed.data.code), "hex");
    const b = Buffer.from(otp.code_hash, "hex");
    const match = a.length === b.length && timingSafeEqual(a, b);
    if (!match) {
      db.prepare("UPDATE otp_verifications SET attempts = attempts + 1 WHERE id = ?").run(otp.id);
      return fail(res, 400, "VALIDATION_ERROR", "Incorrect OTP. Please try again.");
    }
    db.prepare("UPDATE otp_verifications SET used = 1 WHERE id = ?").run(otp.id);
    } else {
      console.log(`[auth] demo patient login for ${phone}`);
    }

    let user = row<{ id: string; phone: string | null; name: string | null; role: string }>(
      "SELECT id, phone, name, role FROM users WHERE phone = ?",
      phone
    );
    const now = nowIso();
    if (!user) {
      const id = randomUUID();
      db.prepare(
        `INSERT INTO users (id, phone, role, name, status, created_at, updated_at, last_login_at)
         VALUES (?, ?, 'PATIENT', NULL, 'ACTIVE', ?, ?, ?)`
      ).run(id, phone, now, now, now);
      user = { id, phone, name: null, role: "PATIENT" };
    } else {
      db.prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?").run(now, now, user.id);
    }

    // Ensure a self patient profile exists for the account.
    const profile = row<{ id: string }>(
      "SELECT id FROM patient_profiles WHERE user_id = ? AND (relationship_to_account IS NULL OR relationship_to_account = 'SELF') LIMIT 1",
      user.id
    );
    if (!profile) {
      db.prepare(
        `INSERT INTO patient_profiles (id, user_id, full_name, phone, relationship_to_account, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'SELF', ?, ?)`
      ).run(randomUUID(), user.id, user.name ?? "Patient", phone, now, now);
    }

    const token = signToken({ id: user.id, role: user.role as "PATIENT", phone: user.phone, email: null });
    return ok(res, 200, { token, user: { id: user.id, phone: user.phone, role: user.role, name: user.name } });
  })
);

const staffLoginSchema = z.object({ identifier: z.string().min(3), password: z.string().min(1) });

router.post(
  "/staff-login",
  ah(async (req, res) => {
    const parsed = staffLoginSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Invalid request.", zodFieldErrors(parsed.error));
    const { identifier, password } = parsed.data;

    const user = row<{
      id: string;
      phone: string | null;
      email: string | null;
      name: string | null;
      role: string;
      status: string;
      password_hash: string | null;
    }>(
      `SELECT id, phone, email, name, role, status, password_hash FROM users
       WHERE (email = ? OR phone = ?) AND role IN ('RECEPTIONIST','CLINIC_ADMIN','DOCTOR') LIMIT 1`,
      identifier,
      identifier
    );
    if (!user || user.status !== "ACTIVE" || !user.password_hash) {
      return fail(res, 401, "UNAUTHORIZED", "Invalid credentials.");
    }
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return fail(res, 401, "UNAUTHORIZED", "Invalid credentials.");

    const staff = row<{ clinic_id: string }>(
      "SELECT clinic_id FROM clinic_staff WHERE user_id = ? AND status = 'ACTIVE' LIMIT 1",
      user.id
    );
    const now = nowIso();
    db.prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?").run(now, now, user.id);

    const token = signToken({ id: user.id, role: user.role as "DOCTOR", phone: user.phone, email: user.email });
    return ok(res, 200, {
      token,
      user: {
        id: user.id,
        phone: user.phone,
        email: user.email,
        role: user.role,
        name: user.name,
        clinicId: staff?.clinic_id ?? null,
      },
    });
  })
);

router.post(
  "/logout",
  requireAuth,
  ah(async (req, res) => {
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    try {
      const decoded = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString()) as {
        jti?: string;
        exp?: number;
      };
      if (decoded.jti) {
        db.prepare("INSERT OR IGNORE INTO revoked_tokens (jti, expires_at) VALUES (?, ?)").run(
          decoded.jti,
          new Date((decoded.exp ?? 0) * 1000).toISOString()
        );
      }
    } catch {
      // ignore malformed token on logout
    }
    return ok(res, 200, { ok: true });
  })
);

router.get(
  "/me",
  requireAuth,
  ah(async (req, res) => {
    const u = req.user!;
    return ok(res, 200, {
      user: { id: u.id, phone: u.phone, email: u.email, role: u.role, name: u.name, clinicId: u.clinicId },
    });
  })
);

export default router;
export { normalizePhone };
