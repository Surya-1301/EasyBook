# EasyBook API — Backend

Express 4 + TypeScript (strict) + better-sqlite3 REST API for EasyBook’s local-service
workspaces. Clinic appointments and queues are the first fully connected workspace.

Base URL: `http://localhost:4000/api/v1`

## Setup

```bash
npm install
cp .env.example .env
# Set the BOOTSTRAP_* values in .env, then:
npm run bootstrap
npm run dev
```

Other scripts:

- `npm run build` — type-check + compile to `dist/`
- `npm start` — run the compiled server (`node dist/index.js`)
- `npm run bootstrap` — create one clinic and its first clinic administrator;
  refuses to run if a clinic already exists
- `npm run demo-user` — create or refresh local staff and patient demo accounts

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
    admin/                 Clinic workspace settings, doctors, schedules, exceptions, services, staff, reports, audit
    directory/             Nearby local-business discovery
  bootstrap.ts             First clinic/admin setup
  demo-user.ts             Local demo account setup
```

## Key behaviours

- **Auth**: patients log in with phone OTP (6-digit, SHA-256 hashed, 5-min expiry,
  5 attempts, rate-limited per phone). For the configured demo phone in development,
  the demo password can be entered as the OTP without an SMS provider.
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
- All timestamps are UTC ISO 8601; scheduling math uses the configured clinic timezone
  (`Asia/Kolkata` by default). Errors use `{ error: { code, message, fieldErrors? } }`.

## Demo credentials

After `npm run bootstrap` and `npm run demo-user`:

| Role         | Login                              | Password       |
| ------------ | ---------------------------------- | -------------- |
| Configured demo staff role | `DEMO_EMAIL` or `DEMO_PHONE` | `DEMO_PASSWORD` |
| Configured demo patient | `DEMO_PHONE` | enter `DEMO_PASSWORD` as OTP |

Patient login flow (dev, using the default demo values):

```bash
curl -X POST http://localhost:4000/api/v1/auth/request-otp \
  -H 'Content-Type: application/json' -d '{"phone":"9616398313"}'
# -> { ok: true, expiresInSeconds: 300 }

curl -X POST http://localhost:4000/api/v1/auth/verify-otp \
  -H 'Content-Type: application/json' -d '{"phone":"9616398313","code":"123456"}'
# -> { token, user } when code is the configured demo password
```

Bootstrap creates only the clinic and administrator. Add doctors, services, schedules,
and staff from the admin console, or use the demo-user script for local login testing.

## Health checks

- `GET /health` → `{ ok: true }`
- `GET /ready` → `{ ok: true, db: true }`
