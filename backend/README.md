# Clinic Appointment App — Backend

Express 4 + TypeScript (strict) + better-sqlite3 REST API for a local clinic
appointment and queue management app.

Base URL: `http://localhost:4000/api/v1`

## Setup

```bash
cd backend
npm install
cp .env.example .env   # PORT=4000, JWT_SECRET=dev-secret-change-me, NODE_ENV=development
npm run seed           # create SQLite DB + demo data
npm run dev            # start with hot reload (tsx watch)
```

Other scripts:

- `npm run build` — type-check + compile to `dist/`
- `npm start` — run the compiled server (`node dist/index.js`)
- `npm run seed` — wipe + reseed demo data (safe to re-run)

The SQLite file lives at `backend/data/clinic.db` (gitignored via `data/`).

## Architecture

```
src/
  index.ts                 Express app, route mounting, hold sweeper, shutdown
  config.ts                Env config
  db.ts                    better-sqlite3 connection + full schema
  types.ts                 Roles, settings, shared constants
  lib/
    time.ts                Timezone-aware scheduling helpers (clinic-local <-> UTC)
    http.ts                Error shape, async wrapper, zod helpers
  middleware/
    auth.ts                requireAuth (JWT), requireRole, requireStaff
  services/
    availability.ts        Slot generation engine (recurring + exceptions - bookings)
    appointments.ts        Status transitions, appointment numbers, shaping
    queue.ts               Token allocation, queue views, estimates, reorder
    notifications.ts       Notification rows (SMS/QUEUED) + console log (no real provider)
    audit.ts               Audit log writer
  modules/
    auth/                  OTP (patient) + password login (staff)
    patients/              Self profile + family members
    doctors/               Public clinic/doctor/service reads + availability
    appointments/          Hold -> confirm, list, cancel, reschedule, check-in
    queue/                 Staff/doctor queue ops + patient queue view
    reception/             Today's dashboard, bookings, walk-ins, no-show, delay, block-slot
    doctor/                Doctor dashboard, queue start/complete, follow-up
    admin/                 Clinic settings, doctors, schedules, exceptions, services, staff, reports, audit
  seed.ts                  Demo data
```

## Key behaviours

- **Auth**: patients log in with phone OTP (6-digit, SHA-256 hashed, 5-min expiry,
  5 attempts, rate-limited per phone). In `NODE_ENV=development`,
  `POST /auth/request-otp` returns `devCode` in the response for testers.
  Staff log in with email/phone + bcrypt password. JWT access tokens (24h, HS256);
  `POST /auth/logout` revokes the token (blacklist).
- **Double-booking protection**: partial unique index
  `ux_active_slot ON appointments(doctor_id, start_at) WHERE status IN (active…)`.
  Races return `409 { error: { code: "SLOT_UNAVAILABLE" } }`.
- **Holds**: `POST /appointments/hold` creates a `HELD` row expiring in 5 minutes;
  a server-side sweeper marks expired holds `EXPIRED` every 60s. Confirm converts
  `HELD → CONFIRMED` (or `BOOKED` when the clinic's `autoConfirm` is off) inside
  a transaction.
- **Availability**: generated per clinic-local date from `recurring_schedules`
  (dayOfWeek 0=Sun…6=Sat, `HH:MM` windows) minus `schedule_exceptions`
  (`LEAVE`/`BLOCK`/`CUSTOM_HOURS`/`EXTRA_HOURS`) minus active appointments/holds,
  honouring `maxAdvanceDays` (30) and `minAdvanceMinutes` (30). Statuses:
  `AVAILABLE` / `BOOKED` / `BLOCKED`.
- **Queue**: token numbers are sequential per (clinic, doctor, date) via
  `MAX(token_number)+1` in a transaction with a unique index; reorder requires a
  reason and writes an audit log. `estimatedWaitMinutes = patientsAhead × avg slot
  duration + doctor delay`.
- **Doctor delays** are stored per (doctor, date), added to queue estimates, and
  generate SMS notification rows for waiting patients.
- **Notifications**: rows are inserted with `status=QUEUED` and logged to the
  console — no real SMS provider in V1.
- **Audit**: appointment created/cancelled/rescheduled/no-show/checked-in,
  queue reorder/ticket transitions, schedule changed, exception added/removed,
  slot blocked, delay set, staff created/updated, clinic updated.
- **Cancellation/reschedule policy**: enforced against the clinic's
  `cancellationCutoffMinutes` / `rescheduleCutoffMinutes` (defaults 60).
- All timestamps are UTC ISO 8601; scheduling math uses the clinic timezone
  (`Asia/Kolkata` in seed data). Errors use `{ error: { code, message, fieldErrors? } }`.

## Demo credentials

After `npm run seed`:

| Role         | Login                              | Password       |
| ------------ | ---------------------------------- | -------------- |
| CLINIC_ADMIN | `admin@demo.clinic`                | `admin123`     |
| RECEPTIONIST | `reception@demo.clinic`            | `reception123` |
| DOCTOR       | `amit@demo.clinic` (Amit Sharma)   | `doctor123`    |
| DOCTOR       | `neha@demo.clinic` (Neha Verma)    | `doctor123`    |
| PATIENT      | `9000000001` … `9000000005` (OTP)  | use `devCode`  |

Patient login flow (dev):

```bash
curl -X POST http://localhost:4000/api/v1/auth/request-otp \
  -H 'Content-Type: application/json' -d '{"phone":"9000000001"}'
# -> { ok: true, expiresInSeconds: 300, devCode: "123456" }

curl -X POST http://localhost:4000/api/v1/auth/verify-otp \
  -H 'Content-Type: application/json' -d '{"phone":"9000000001","code":"123456"}'
# -> { token, user }
```

The seed creates a demo day (today) with completed, cancelled, no-show,
checked-in + waiting queue tickets, a walk-in, and confirmed upcoming
appointments — the reception/doctor dashboards are immediately demonstrable.

## Health checks

- `GET /health` → `{ ok: true }`
- `GET /ready` → `{ ok: true, db: true }`
