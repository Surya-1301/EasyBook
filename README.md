# EasyBook

Clinic appointment and queue management for patients, reception staff, doctors, and clinic
administrators. The backend uses SQLite and the frontend is a Vite/React app.

```
clinic-app/
├── backend/    Express + TypeScript + SQLite REST API (port 4000)
└── frontend/   Vite + React + TypeScript + Tailwind (port 5173)
```

## Quick start

**1. Install dependencies**
```bash
npm install
npm run install:all
```

**2. Create a clinic and administrator**
```bash
cp backend/.env.example backend/.env
# Set BOOTSTRAP_CLINIC_NAME, BOOTSTRAP_ADMIN_NAME,
# BOOTSTRAP_ADMIN_EMAIL, and BOOTSTRAP_ADMIN_PASSWORD in backend/.env.
cd backend
npm run bootstrap
```

Copy `frontend/.env.example` to `frontend/.env` and set `VITE_CLINIC_ID` to the
clinic id printed by `npm run bootstrap`.

**3. Start both apps**
```bash
cd ..
npm run dev
```

The frontend runs at `http://localhost:5173`; the API runs at
`http://localhost:4000`.

## Demo accounts

After bootstrapping a clinic, run `npm run demo-user --prefix backend` to create
local test accounts. Defaults are:

- Staff/admin: phone `9616398313`, password `123456`
- Patient: phone `9616398313`, then enter `123456` as the OTP

The demo patient OTP bypass is disabled automatically when `NODE_ENV=production`.

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
- **Backend guarantees**: double-booking protection, five-minute slot holds with
  expiry cleanup, sequential queue tokens, audit logging, and a consistent error shape.

## Notes

- SQLite file lives at `backend/data/clinic.db` (gitignored). Bootstrap refuses to run
  when a clinic already exists.
- Notifications are logged to the backend console (SMS provider plugs into `NotificationService` later).
- Set a strong `JWT_SECRET` in `backend/.env` outside local development.
- Health endpoints: `GET /health` and `GET /ready`.
