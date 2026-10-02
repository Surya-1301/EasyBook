/**
 * Bootstrap a fresh installation: creates exactly one clinic and its first
 * clinic-admin user. Creates no demo data — no sample doctors, patients,
 * services or appointments.
 *
 * Refuses to run if any clinic already exists (safe to keep around).
 *
 * Usage:
 *   BOOTSTRAP_CLINIC_NAME="My Clinic" \
 *   BOOTSTRAP_ADMIN_NAME="Admin Name" \
 *   BOOTSTRAP_ADMIN_EMAIL="admin@myclinic.com" \
 *   BOOTSTRAP_ADMIN_PASSWORD="<strong password>" \
 *   npm run bootstrap
 *
 * Optional: BOOTSTRAP_CLINIC_PHONE, BOOTSTRAP_ADMIN_PHONE, BOOTSTRAP_TIMEZONE
 * (defaults to Asia/Kolkata), BOOTSTRAP_CLINIC_ID (defaults to a uuid).
 */
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { db, row } from "./db";
import { nowIso } from "./lib/time";

function required(name: string): string {
  const v = (process.env[name] || "").trim();
  if (!v) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return v;
}

async function main() {
  const existing = row<{ c: number }>("SELECT COUNT(*) AS c FROM clinics");
  if ((existing?.c ?? 0) > 0) {
    console.error("A clinic already exists — bootstrap refuses to run twice. Delete the database file to start over.");
    process.exit(1);
  }

  const clinicName = required("BOOTSTRAP_CLINIC_NAME");
  const adminName = required("BOOTSTRAP_ADMIN_NAME");
  const adminEmail = required("BOOTSTRAP_ADMIN_EMAIL").toLowerCase();
  const adminPassword = required("BOOTSTRAP_ADMIN_PASSWORD");
  if (adminPassword.length < 8) {
    console.error("BOOTSTRAP_ADMIN_PASSWORD must be at least 8 characters.");
    process.exit(1);
  }

  const clinicId = (process.env.BOOTSTRAP_CLINIC_ID || "").trim() || randomUUID();
  const timezone = (process.env.BOOTSTRAP_TIMEZONE || "").trim() || "Asia/Kolkata";
  const clinicPhone = (process.env.BOOTSTRAP_CLINIC_PHONE || "").trim() || "";
  const adminPhone = (process.env.BOOTSTRAP_ADMIN_PHONE || "").trim() || null;
  const now = nowIso();

  db.prepare(
    `INSERT INTO clinics
       (id, name, description, phone, email, address_line_1, city, state, postal_code, timezone, status, settings, created_at, updated_at)
     VALUES (?, ?, '', ?, ?, '', '', '', '', ?, 'ACTIVE', ?, ?, ?)`
  ).run(
    clinicId,
    clinicName,
    clinicPhone,
    adminEmail,
    timezone,
    JSON.stringify({
      booking: { maxAdvanceDays: 30, minAdvanceMinutes: 30, cancellationCutoffMinutes: 60, rescheduleCutoffMinutes: 60, autoConfirm: true },
      queue: { walkInsEnabled: true, patientSelfCheckInEnabled: true },
      notifications: { confirmationEnabled: true, reminderEnabled: true, delayNotificationEnabled: true },
    }),
    now,
    now
  );

  const adminId = randomUUID();
  const hash = await bcrypt.hash(adminPassword, 10);
  db.prepare(
    `INSERT INTO users (id, phone, email, password_hash, role, name, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'CLINIC_ADMIN', ?, 'ACTIVE', ?, ?)`
  ).run(adminId, adminPhone, adminEmail, hash, adminName, now, now);
  db.prepare(
    `INSERT INTO clinic_staff (id, clinic_id, user_id, role, status, created_at, updated_at)
     VALUES (?, ?, ?, 'CLINIC_ADMIN', 'ACTIVE', ?, ?)`
  ).run(randomUUID(), clinicId, adminId, now, now);

  console.log("\nBootstrap complete ✔");
  console.log(`  Clinic   : ${clinicName}`);
  console.log(`  Clinic ID: ${clinicId}`);
  console.log(`  Timezone : ${timezone}`);
  console.log(`  Admin    : ${adminEmail}`);
  console.log("\nNext steps:");
  console.log(`  1. Set VITE_CLINIC_ID=${clinicId} in frontend/.env`);
  console.log("  2. Start the backend (npm run dev) and the frontend (npm run dev).");
  console.log("  3. Log in at /staff/login as the admin, then add doctors, services and schedules.");
  console.log("  4. Connect a real SMS provider for patient OTP login.");
  console.log("");
}

main().catch((err) => {
  console.error("Bootstrap failed:", err);
  process.exit(1);
});
