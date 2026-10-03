import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { config } from "./config";

const dbPath = path.resolve(config.dbPath);
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  phone TEXT UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT,
  role TEXT NOT NULL,
  name TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS patient_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  full_name TEXT NOT NULL,
  date_of_birth TEXT,
  gender TEXT,
  phone TEXT,
  email TEXT,
  relationship_to_account TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS ix_patient_profiles_user ON patient_profiles(user_id);
CREATE INDEX IF NOT EXISTS ix_patient_profiles_phone ON patient_profiles(phone);

CREATE TABLE IF NOT EXISTS clinics (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  logo_url TEXT,
  description TEXT,
  phone TEXT NOT NULL,
  email TEXT,
  address_line_1 TEXT NOT NULL,
  address_line_2 TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  settings TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS local_businesses (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  rating REAL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_local_businesses_location ON local_businesses(latitude, longitude, status);

CREATE TABLE IF NOT EXISTS clinic_staff (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (clinic_id, user_id),
  FOREIGN KEY (clinic_id) REFERENCES clinics(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS doctors (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  user_id TEXT,
  name TEXT NOT NULL,
  specialty TEXT NOT NULL,
  qualification TEXT,
  experience_years INTEGER,
  languages TEXT,
  bio TEXT,
  photo_url TEXT,
  consultation_fee REAL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (clinic_id) REFERENCES clinics(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS ix_doctors_clinic ON doctors(clinic_id);

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL,
  fee REAL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (clinic_id) REFERENCES clinics(id)
);
CREATE INDEX IF NOT EXISTS ix_services_clinic ON services(clinic_id);

CREATE TABLE IF NOT EXISTS doctor_services (
  doctor_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  PRIMARY KEY (doctor_id, service_id),
  FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS recurring_schedules (
  id TEXT PRIMARY KEY,
  doctor_id TEXT NOT NULL,
  day_of_week INTEGER NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  break_start_time TEXT,
  break_end_time TEXT,
  slot_duration_minutes INTEGER,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_sched_doctor_day ON recurring_schedules(doctor_id, day_of_week);

CREATE TABLE IF NOT EXISTS schedule_exceptions (
  id TEXT PRIMARY KEY,
  doctor_id TEXT NOT NULL,
  date TEXT NOT NULL,
  type TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  reason TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_exceptions_doctor_date ON schedule_exceptions(doctor_id, date);

-- Optional materialized slot table (slots are generated on demand in V1)
CREATE TABLE IF NOT EXISTS appointment_slots (
  id TEXT PRIMARY KEY,
  doctor_id TEXT NOT NULL,
  service_id TEXT,
  clinic_id TEXT NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  status TEXT NOT NULL,
  hold_expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  appointment_number TEXT UNIQUE NOT NULL,
  clinic_id TEXT NOT NULL,
  doctor_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  status TEXT NOT NULL,
  booking_source TEXT NOT NULL,
  booking_created_by TEXT,
  idempotency_key TEXT UNIQUE,
  hold_expires_at TEXT,
  rescheduled_from_appointment_id TEXT,
  notes_for_clinic TEXT,
  cancellation_reason TEXT,
  cancelled_at TEXT,
  checked_in_at TEXT,
  consultation_started_at TEXT,
  consultation_completed_at TEXT,
  follow_up_required INTEGER NOT NULL DEFAULT 0,
  follow_up_notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (clinic_id) REFERENCES clinics(id),
  FOREIGN KEY (doctor_id) REFERENCES doctors(id),
  FOREIGN KEY (patient_id) REFERENCES patient_profiles(id)
);
-- Double-booking protection: one exclusive doctor slot, one active appointment.
CREATE UNIQUE INDEX IF NOT EXISTS ux_active_slot ON appointments(doctor_id, start_at)
  WHERE status IN ('HELD','BOOKED','CONFIRMED','CHECKED_IN','WAITING','IN_CONSULTATION');
CREATE INDEX IF NOT EXISTS ix_appt_doctor_start ON appointments(doctor_id, start_at);
CREATE INDEX IF NOT EXISTS ix_appt_patient ON appointments(patient_id, start_at);
CREATE INDEX IF NOT EXISTS ix_appt_clinic_start ON appointments(clinic_id, start_at);

CREATE TABLE IF NOT EXISTS appointment_counters (
  clinic_id TEXT NOT NULL,
  date TEXT NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (clinic_id, date)
);

CREATE TABLE IF NOT EXISTS queue_tickets (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  doctor_id TEXT NOT NULL,
  appointment_id TEXT,
  patient_id TEXT NOT NULL,
  visit_date TEXT NOT NULL,
  token_number INTEGER NOT NULL,
  status TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  estimated_wait_minutes INTEGER,
  checked_in_at TEXT NOT NULL,
  called_at TEXT,
  consultation_started_at TEXT,
  consultation_completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id),
  FOREIGN KEY (patient_id) REFERENCES patient_profiles(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_queue_token
  ON queue_tickets(clinic_id, doctor_id, visit_date, token_number);
CREATE INDEX IF NOT EXISTS ix_queue_day ON queue_tickets(clinic_id, doctor_id, visit_date, status);

CREATE TABLE IF NOT EXISTS doctor_delays (
  id TEXT PRIMARY KEY,
  doctor_id TEXT NOT NULL,
  date TEXT NOT NULL,
  delay_minutes INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (doctor_id, date)
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  appointment_id TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT(3) NOT NULL DEFAULT 'INR',
  method TEXT,
  status TEXT NOT NULL,
  provider_reference TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  patient_id TEXT,
  appointment_id TEXT,
  channel TEXT NOT NULL,
  template_key TEXT NOT NULL,
  destination TEXT NOT NULL,
  status TEXT NOT NULL,
  provider_message_id TEXT,
  sent_at TEXT,
  delivered_at TEXT,
  failed_at TEXT,
  failure_reason TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_notifications_appt ON notifications(appointment_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  actor_user_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  action TEXT NOT NULL,
  old_values TEXT,
  new_values TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_audit_clinic_time ON audit_logs(clinic_id, created_at);

CREATE TABLE IF NOT EXISTS otp_verifications (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_otp_phone ON otp_verifications(phone, created_at);

CREATE TABLE IF NOT EXISTS revoked_tokens (
  jti TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL
);
`;

db.exec(SCHEMA);

for (const column of [
  "ALTER TABLE users ADD COLUMN service_type TEXT",
  "ALTER TABLE users ADD COLUMN workspace_id TEXT",
]) {
  try {
    db.exec(column);
  } catch {
    // Columns already exist on databases created after this migration.
  }
}

export function row<T>(sql: string, ...params: unknown[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

export function rows<T>(sql: string, ...params: unknown[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}
