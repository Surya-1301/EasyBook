/**
 * Create (or refresh) demo logins for local testing — one for staff, one for
 * the patient app — both using the same phone + password.
 *
 * - Staff:   log in at /staff/login with the phone + password.
 * - Patient: log in at /login — enter the phone, request the code, then enter
 *            the password as the OTP. The backend accepts it for the demo
 *            number without an SMS provider (dev only, see DEMO_LOGIN_ENABLED).
 *
 * Safe to re-run: it updates the existing demo rows instead of duplicating.
 * Requires a clinic to already exist (run `npm run bootstrap` first).
 *
 * Usage:
 *   npm run demo-user
 *
 * Optional env (defaults shown):
 *   DEMO_PHONE="9616398313"  DEMO_PASSWORD="123456"
 *   DEMO_NAME="Demo User"    DEMO_ROLE="CLINIC_ADMIN"  DEMO_EMAIL=""
 *   DEMO_CLINIC_ID="<id>" (defaults to the first clinic)
 *   DEMO_LOGIN_ENABLED="true" (patient OTP bypass; auto-off in production)
 */
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { db, row } from "./db";
import { nowIso } from "./lib/time";

const VALID_ROLES = ["RECEPTIONIST", "CLINIC_ADMIN", "DOCTOR"] as const;

async function main() {
  const phone = (process.env.DEMO_PHONE || "").trim() || "9616398313";
  const password = process.env.DEMO_PASSWORD ?? "123456";
  const name = (process.env.DEMO_NAME || "").trim() || "Demo User";
  const role = ((process.env.DEMO_ROLE || "").trim().toUpperCase() || "CLINIC_ADMIN") as string;
  // Staff identifier: defaults to the phone so /staff/login accepts the phone
  // number. Stored in the email column so the phone column stays free for the
  // patient row (users.phone is UNIQUE).
  const staffIdentifier = (process.env.DEMO_EMAIL || "").trim().toLowerCase() || phone;
  if (!VALID_ROLES.includes(role as (typeof VALID_ROLES)[number])) {
    console.error(`DEMO_ROLE must be one of: ${VALID_ROLES.join(", ")}`);
    process.exit(1);
  }
  if (!/^\d{10}$/.test(phone)) {
    console.error("DEMO_PHONE must be a 10-digit mobile number.");
    process.exit(1);
  }
  if (!password) {
    console.error("DEMO_PASSWORD must not be empty.");
    process.exit(1);
  }

  const clinicIdFromEnv = (process.env.DEMO_CLINIC_ID || "").trim();
  const clinic = clinicIdFromEnv
    ? row<{ id: string; name: string }>("SELECT id, name FROM clinics WHERE id = ?", clinicIdFromEnv)
    : row<{ id: string; name: string }>("SELECT id, name FROM clinics ORDER BY created_at ASC LIMIT 1");
  if (!clinic) {
    console.error("No clinic found — run `npm run bootstrap` first, then `npm run demo-user`.");
    process.exit(1);
  }

  const now = nowIso();
  const hash = await bcrypt.hash(password, 10);

  // --- Staff demo row (email column holds the identifier; phone stays NULL so
  // --- the patient row can own the phone number).
  const staffExisting =
    row<{ id: string }>("SELECT id FROM users WHERE email = ?", staffIdentifier) ??
    row<{ id: string }>("SELECT id FROM users WHERE phone = ? AND role != 'PATIENT'", phone);
  let staffId: string;
  if (staffExisting) {
    staffId = staffExisting.id;
    db.prepare(
      `UPDATE users SET phone = NULL, email = ?, password_hash = ?, role = ?, name = ?, status = 'ACTIVE', updated_at = ?
       WHERE id = ?`
    ).run(staffIdentifier, hash, role, name, now, staffId);
  } else {
    staffId = randomUUID();
    db.prepare(
      `INSERT INTO users (id, phone, email, password_hash, role, name, status, created_at, updated_at)
       VALUES (?, NULL, ?, ?, ?, ?, 'ACTIVE', ?, ?)`
    ).run(staffId, staffIdentifier, hash, role, name, now, now);
  }
  const link = row<{ id: string }>(
    "SELECT id FROM clinic_staff WHERE clinic_id = ? AND user_id = ?",
    clinic.id,
    staffId
  );
  if (!link) {
    db.prepare(
      `INSERT INTO clinic_staff (id, clinic_id, user_id, role, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)`
    ).run(randomUUID(), clinic.id, staffId, role, now, now);
  } else {
    db.prepare("UPDATE clinic_staff SET role = ?, status = 'ACTIVE', updated_at = ? WHERE id = ?").run(
      role,
      now,
      link.id
    );
  }

  // --- Patient demo row (phone-based; the OTP bypass in /verify-otp accepts
  // --- DEMO_PASSWORD as the code for DEMO_PHONE).
  const patientExisting = row<{ id: string }>(
    "SELECT id FROM users WHERE phone = ? AND role = 'PATIENT'",
    phone
  );
  if (!patientExisting) {
    const patientId = randomUUID();
    db.prepare(
      `INSERT INTO users (id, phone, email, password_hash, role, name, status, created_at, updated_at)
       VALUES (?, ?, NULL, NULL, 'PATIENT', ?, 'ACTIVE', ?, ?)`
    ).run(patientId, phone, name, now, now);
    db.prepare(
      `INSERT INTO patient_profiles (id, user_id, full_name, phone, relationship_to_account, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'SELF', ?, ?)`
    ).run(randomUUID(), patientId, name, phone, now, now);
  }

  console.log("\nDemo logins ready ✔");
  console.log(`  Staff   : /staff/login  →  ${staffIdentifier} / ${password}  (${role})`);
  console.log(`  Patient : /login        →  ${phone}, then enter ${password} as the OTP`);
  console.log(`  Clinic  : ${clinic.name}`);
  console.log("  Note    : the patient OTP bypass is dev-only — it is disabled when NODE_ENV=production");
  if (password.length < 8) {
    console.log("          (weak demo password — fine for local testing, never use in production)");
  }
  console.log("");
}

main().catch((err) => {
  console.error("demo-user failed:", err);
  process.exit(1);
});
