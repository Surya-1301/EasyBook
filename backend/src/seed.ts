/**
 * Seed demo data: clinic, doctors + schedules, services, staff, patients,
 * and a demo day (today) with a realistic appointment mix.
 * Safe to re-run — it wipes existing data first.
 *
 * Usage: npm run seed
 */
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { db, row } from "./db";
import { localDate, nowIso, zonedTimeToUtc } from "./lib/time";
import { nextAppointmentNumber } from "./services/appointments";

const TZ = "Asia/Kolkata";
const todayLocal = localDate(Date.now(), TZ);
const t = (hhmm: string) => zonedTimeToUtc(todayLocal, hhmm, TZ);
const now = nowIso();

function wipe() {
  const tables = [
    "payments",
    "notifications",
    "queue_tickets",
    "appointments",
    "appointment_counters",
    "doctor_delays",
    "schedule_exceptions",
    "recurring_schedules",
    "doctor_services",
    "services",
    "doctors",
    "clinic_staff",
    "patient_profiles",
    "users",
    "clinics",
    "audit_logs",
    "otp_verifications",
    "revoked_tokens",
  ];
  db.exec("PRAGMA foreign_keys = OFF");
  for (const tbl of tables) db.exec(`DELETE FROM ${tbl}`);
  db.exec("PRAGMA foreign_keys = ON");
}

function seed() {
  wipe();

  // --- Clinic -----------------------------------------------------------------
  // Fixed id so the frontend's VITE_CLINIC_ID=demo-clinic default always matches.
  const clinicId = "demo-clinic";
  db.prepare(
    `INSERT INTO clinics
       (id, name, description, phone, email, address_line_1, city, state, postal_code, timezone, status, settings, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)`
  ).run(
    clinicId,
    "ABC Family Clinic",
    "Your neighbourhood family clinic — general medicine and dermatology.",
    "911234567890",
    "care@abcfamilyclinic.demo",
    "123 Main Road",
    "Local City",
    "Chhattisgarh",
    "492001",
    TZ,
    JSON.stringify({
      booking: { maxAdvanceDays: 30, minAdvanceMinutes: 30, cancellationCutoffMinutes: 60, rescheduleCutoffMinutes: 60, autoConfirm: true },
      queue: { walkInsEnabled: true, patientSelfCheckInEnabled: true },
      notifications: { confirmationEnabled: true, reminderEnabled: true, delayNotificationEnabled: true },
    }),
    now,
    now
  );

  // --- Services -----------------------------------------------------------------
  const services: Record<string, string> = {};
  const svcDefs: Array<[string, string, number, number]> = [
    ["General Consultation", "General health consultation", 20, 500],
    ["Follow-up", "Follow-up visit", 15, 300],
    ["Dermatology Consultation", "Skin, hair and nail consultation", 30, 700],
  ];
  for (const [name, desc, dur, fee] of svcDefs) {
    const id = randomUUID();
    db.prepare(
      `INSERT INTO services (id, clinic_id, name, description, duration_minutes, fee, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`
    ).run(id, clinicId, name, desc, dur, fee, now, now);
    services[name] = id;
  }

  // --- Staff users ----------------------------------------------------------------
  async function createUser(opts: {
    name: string;
    email?: string;
    phone: string;
    password: string;
    role: "CLINIC_ADMIN" | "RECEPTIONIST" | "DOCTOR" | "PATIENT";
    clinicRole?: string;
  }): Promise<string> {
    const id = randomUUID();
    const hash = await bcrypt.hash(opts.password, 10);
    db.prepare(
      `INSERT INTO users (id, phone, email, password_hash, role, name, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`
    ).run(id, opts.phone, opts.email ?? null, hash, opts.role, opts.name, now, now);
    if (opts.clinicRole) {
      db.prepare(
        `INSERT INTO clinic_staff (id, clinic_id, user_id, role, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)`
      ).run(randomUUID(), clinicId, id, opts.clinicRole, now, now);
    }
    return id;
  }

  const run = async () => {
    const adminId = await createUser({ name: "Clinic Admin", email: "admin@demo.clinic", phone: "9000000100", password: "admin123", role: "CLINIC_ADMIN", clinicRole: "CLINIC_ADMIN" });
    await createUser({ name: "Reception", email: "reception@demo.clinic", phone: "9000000101", password: "reception123", role: "RECEPTIONIST", clinicRole: "RECEPTIONIST" });
    const amitUserId = await createUser({ name: "Dr. Amit Sharma", email: "amit@demo.clinic", phone: "9000000102", password: "doctor123", role: "DOCTOR", clinicRole: "DOCTOR" });
    const nehaUserId = await createUser({ name: "Dr. Neha Verma", email: "neha@demo.clinic", phone: "9000000103", password: "doctor123", role: "DOCTOR", clinicRole: "DOCTOR" });

    // --- Doctors --------------------------------------------------------------------
    function createDoctor(userId: string, name: string, specialty: string, fee: number, serviceNames: string[]): string {
      const id = randomUUID();
      db.prepare(
        `INSERT INTO doctors
           (id, clinic_id, user_id, name, specialty, qualification, experience_years, languages, bio, consultation_fee, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`
      ).run(
        id,
        clinicId,
        userId,
        name,
        specialty,
        name.includes("Amit") ? "MBBS, MD (General Medicine)" : "MBBS, MD (Dermatology)",
        name.includes("Amit") ? 12 : 8,
        JSON.stringify(["English", "Hindi"]),
        name.includes("Amit")
          ? "General physician with 12 years of experience in family medicine."
          : "Dermatologist specialising in skin, hair and nail care.",
        fee,
        now,
        now
      );
      const stmt = db.prepare("INSERT INTO doctor_services (doctor_id, service_id) VALUES (?, ?)");
      for (const s of serviceNames) stmt.run(id, services[s]);
      // Mon–Sat (1..6): 09:00–13:00 and 17:00–20:00
      const sched = db.prepare(
        `INSERT INTO recurring_schedules
           (id, doctor_id, day_of_week, start_time, end_time, effective_from, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`
      );
      for (let dow = 1; dow <= 6; dow++) {
        sched.run(randomUUID(), id, dow, "09:00", "13:00", "2026-01-01", now, now);
        sched.run(randomUUID(), id, dow, "17:00", "20:00", "2026-01-01", now, now);
      }
      return id;
    }

    const amitId = createDoctor(amitUserId, "Dr. Amit Sharma", "General Physician", 500, ["General Consultation", "Follow-up"]);
    const nehaId = createDoctor(nehaUserId, "Dr. Neha Verma", "Dermatologist", 700, ["Dermatology Consultation", "Follow-up"]);

    // --- Demo patients ----------------------------------------------------------------
    const patientDefs: Array<[string, string]> = [
      ["Rahul Kumar", "9000000001"],
      ["Priya Singh", "9000000002"],
      ["Amit Kumar", "9000000003"],
      ["Neha Patel", "9000000004"],
      ["Ramesh Kumar", "9000000005"],
    ];
    const patientIds: Record<string, string> = {};
    for (const [name, phone] of patientDefs) {
      const userId = await createUser({ name, phone, password: "patient123", role: "PATIENT" });
      const pid = randomUUID();
      db.prepare(
        `INSERT INTO patient_profiles (id, user_id, full_name, phone, relationship_to_account, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'SELF', ?, ?)`
      ).run(pid, userId, name, phone, now, now);
      patientIds[name] = pid;
    }

    // --- Demo-day appointments ----------------------------------------------------------
    function addAppointment(opts: {
      doctorId: string;
      patientName: string;
      serviceName: string;
      time: string; // HH:MM clinic-local
      status: string;
      extra?: Partial<{ notes: string; cancelReason: string }>;
    }): string {
      const id = randomUUID();
      const startAt = t(opts.time);
      const dur = row<{ duration_minutes: number }>("SELECT duration_minutes FROM services WHERE id = ?", services[opts.serviceName])!.duration_minutes;
      const endAt = new Date(Date.parse(startAt) + dur * 60 * 1000).toISOString();
      const cancelReason = opts.extra?.cancelReason ?? null;
      db.prepare(
        `INSERT INTO appointments
           (id, appointment_number, clinic_id, doctor_id, patient_id, service_id, start_at, end_at,
            status, booking_source, booking_created_by, notes_for_clinic, cancellation_reason,
            cancelled_at, checked_in_at, consultation_started_at, consultation_completed_at,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'RECEPTION', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        nextAppointmentNumber(clinicId),
        clinicId,
        opts.doctorId,
        patientIds[opts.patientName],
        services[opts.serviceName],
        startAt,
        endAt,
        opts.status,
        adminId,
        opts.extra?.notes ?? null,
        cancelReason,
        opts.status === "CANCELLED" ? now : null,
        ["CHECKED_IN", "COMPLETED"].includes(opts.status) ? t(opts.time) : null,
        opts.status === "COMPLETED" ? new Date(Date.parse(startAt) + 5 * 60 * 1000).toISOString() : null,
        opts.status === "COMPLETED" ? new Date(Date.parse(startAt) + 18 * 60 * 1000).toISOString() : null,
        now,
        now
      );
      const fee = row<{ fee: number }>("SELECT fee FROM services WHERE id = ?", services[opts.serviceName])!.fee;
      db.prepare(
        `INSERT INTO payments (id, appointment_id, amount, currency, status, paid_at, created_at, updated_at)
         VALUES (?, ?, ?, 'INR', ?, ?, ?, ?)`
      ).run(
        randomUUID(),
        id,
        fee,
        opts.status === "COMPLETED" ? "PAID" : "PAY_AT_CLINIC",
        opts.status === "COMPLETED" ? now : null,
        now,
        now
      );
      return id;
    }

    function addTicket(opts: { doctorId: string; patientName: string; appointmentId?: string; token: number; status: string }) {
      const id = randomUUID();
      db.prepare(
        `INSERT INTO queue_tickets
           (id, clinic_id, doctor_id, appointment_id, patient_id, visit_date, token_number, status,
            position, checked_in_at, called_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        clinicId,
        opts.doctorId,
        opts.appointmentId ?? null,
        patientIds[opts.patientName],
        todayLocal,
        opts.token,
        opts.status,
        opts.token,
        now,
        opts.status === "CALLED" ? now : null,
        now,
        now
      );
      return id;
    }

    // Morning: history mix (Dr. Amit Sharma)
    addAppointment({ doctorId: amitId, patientName: "Rahul Kumar", serviceName: "General Consultation", time: "09:00", status: "COMPLETED" });
    addAppointment({ doctorId: amitId, patientName: "Priya Singh", serviceName: "General Consultation", time: "09:20", status: "COMPLETED" });
    addAppointment({ doctorId: amitId, patientName: "Amit Kumar", serviceName: "Follow-up", time: "09:40", status: "CANCELLED", extra: { cancelReason: "Patient requested cancellation" } });
    addAppointment({ doctorId: amitId, patientName: "Neha Patel", serviceName: "General Consultation", time: "10:00", status: "NO_SHOW" });
    const checkedInId = addAppointment({ doctorId: amitId, patientName: "Ramesh Kumar", serviceName: "General Consultation", time: "10:20", status: "CHECKED_IN" });
    addTicket({ doctorId: amitId, patientName: "Ramesh Kumar", appointmentId: checkedInId, token: 1, status: "WAITING" });
    addTicket({ doctorId: amitId, patientName: "Priya Singh", token: 2, status: "WAITING" }); // pure walk-in

    // Upcoming confirmed (evening session)
    addAppointment({ doctorId: amitId, patientName: "Rahul Kumar", serviceName: "Follow-up", time: "17:30", status: "CONFIRMED" });
    addAppointment({ doctorId: amitId, patientName: "Amit Kumar", serviceName: "General Consultation", time: "18:00", status: "CONFIRMED" });

    // Dr. Neha Verma
    addAppointment({ doctorId: nehaId, patientName: "Amit Kumar", serviceName: "Dermatology Consultation", time: "09:00", status: "COMPLETED" });
    addAppointment({ doctorId: nehaId, patientName: "Priya Singh", serviceName: "Dermatology Consultation", time: "18:00", status: "CONFIRMED" });

    // --- Audit trail for the demo day ------------------------------------------------------
    db.prepare(
      `INSERT INTO audit_logs (id, clinic_id, actor_user_id, entity_type, entity_id, action, new_values, created_at)
       VALUES (?, ?, ?, 'clinic', ?, 'SEED_COMPLETED', ?, ?)`
    ).run(randomUUID(), clinicId, adminId, clinicId, JSON.stringify({ demoDay: todayLocal }), now);

    console.log("\nSeed complete ✔");
    console.log(`  Clinic : ABC Family Clinic (${clinicId})`);
    console.log(`  Date   : ${todayLocal} (${TZ})`);
    console.log("\nDemo credentials:");
    console.log("  CLINIC_ADMIN : admin@demo.clinic / admin123");
    console.log("  RECEPTIONIST : reception@demo.clinic / reception123");
    console.log("  DOCTOR       : amit@demo.clinic / doctor123   (Dr. Amit Sharma)");
    console.log("  DOCTOR       : neha@demo.clinic / doctor123   (Dr. Neha Verma)");
    console.log("  PATIENT (OTP): 9000000001 … 9000000005  (use /auth/request-otp; devCode is returned in dev)");
    console.log("");
  };

  run().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
}

seed();
