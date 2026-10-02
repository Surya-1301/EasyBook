# Clinic Appointment App — V1

Local clinic appointment + queue management. One live schedule for online, phone, and walk-in patients.
Built from `local-clinic-appointment-app-v1-spec.md`. API surface is pinned in `API_CONTRACT.md`.

```
clinic-app/
├── backend/    Express + TypeScript + SQLite REST API (port 4000)
├── frontend/   Vite + React + TypeScript + Tailwind (port 5173)
└── API_CONTRACT.md
```

## Quick start

**1. Backend**
```bash
cd backend
npm install
npm run seed    # demo clinic, doctors, services, staff, patients, demo day
npm run dev     # http://localhost:4000  (or: npm run build && npm start)
```

**2. Frontend** (new terminal)
```bash
cd frontend
npm install
npm run dev     # http://localhost:5173
```
Optional: copy `.env.example` to `.env` to point at a different API (`VITE_API_URL`)
or clinic (`VITE_CLINIC_ID`, default `demo-clinic`).

## Demo logins

| Role | Login | Credentials |
|---|---|---|
| Patient | `/login` (phone + OTP) | `9000000001` … `9000000005` — the demo OTP code is shown on screen (dev mode) |
| Receptionist | `/staff/login` | `reception@demo.clinic` / `reception123` |
| Clinic admin | `/staff/login` | `admin@demo.clinic` / `admin123` |
| Doctor | `/staff/login` | `amit@demo.clinic` / `doctor123` (also `neha@demo.clinic` / `doctor123`) |

Seeded: **ABC Family Clinic**, Dr. Amit Sharma (General Physician, ₹500) and
Dr. Neha Verma (Dermatologist, ₹700), Mon–Sat 09:00–13:00 + 17:00–20:00,
3 services, 5 demo patients, and a demo day with completed / cancelled /
no-show / checked-in / waiting / walk-in appointments.

## What's inside

- **Patient app** (mobile-first): home, doctor list + profiles, 12-day date strip,
  slot picker, family-member booking, appointment details with cancel/reschedule/
  check-in, live queue screen ("now serving #21, 3 before you, ~20 min").
- **Reception** (desktop-first): today's dashboard with stats, fast phone booking
  (phone auto-fill), walk-in with token print, patient search, queue management
  (call / skip / recall / start / complete), doctor delay setter.
- **Doctor**: today's schedule, live queue, start/complete visit, follow-up marker.
- **Admin**: clinic settings + booking policy, doctor CRUD, weekly schedule editor
  with exceptions (leave / block / custom / extra hours), services, staff, reports
  with CSV export, audit logs.
- **Backend guarantees**: double-booking blocked by a partial unique DB index
  (verified with a race test → `409 SLOT_UNAVAILABLE`), 5-minute slot holds with
  expiry sweeper, sequential queue tokens per doctor/day, audit log on every
  sensitive action, consistent error shape.

## Notes

- SQLite file lives at `backend/data/clinic.db` (gitignored). Re-run `npm run seed` anytime for fresh demo data.
- Notifications are logged to the backend console (SMS provider plugs into `NotificationService` later).
- JWT secret: set `JWT_SECRET` in `backend/.env` for anything beyond local demo.
