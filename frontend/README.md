# Clinic App — Frontend

Vite + React 18 + TypeScript (strict) + Tailwind CSS v3 + react-router-dom v6.

Patient app is mobile-first (bottom tab bar); reception is desktop-first (sidebar); doctor console is tablet-friendly.

## Setup

```bash
cd frontend
npm install
cp .env.example .env   # adjust values
npm run dev            # http://localhost:5173
npm run build          # type-check + production build (dist/)
```

## Environment

| Variable         | Default                          | Purpose                              |
|------------------|----------------------------------|--------------------------------------|
| `VITE_API_URL`   | `http://localhost:4000/api/v1`   | Backend REST base URL                |
| `VITE_CLINIC_ID` | —                 | Clinic id for public doctor/service listings; required at startup |

The JWT is stored in `localStorage` under `clinic_token`. Every request attaches
`Authorization: Bearer <token>`; a `401` clears the token and redirects to the
appropriate login page (`/login` or `/staff/login`).

## Demo credentials

Patient login is phone + OTP. For local demo use, the backend accepts the
configured demo password as the OTP for the configured demo phone; no real SMS
provider is needed.

Staff / doctor login is at `/staff/login` (email or phone + password):

| Role         | Identifier            | Password      | Lands on        |
|--------------|-----------------------|---------------|-----------------|
| Configured staff account | `DEMO_EMAIL` or `DEMO_PHONE` | `DEMO_PASSWORD` | role-based |

Create these accounts with `npm run demo-user --prefix backend` after running
`npm run bootstrap`.

## Login instructions

- **Patient:** open `/login`, enter the configured demo phone, tap "Send code",
  then enter the configured demo password as the six-digit OTP.
- **Staff/doctor:** open `/staff/login`, enter the demo identifier and password.
  The destination depends on the account role.

## Routes

Patient (`/login` public, rest requires PATIENT role):
`/home`, `/doctors`, `/doctors/:id`, `/booking/:doctorId?date=&slot=&serviceId=`,
`/appointments`, `/appointments/:id`, `/queue/:appointmentId`, `/profile`

Reception (`/staff/login` public, rest requires RECEPTIONIST or CLINIC_ADMIN):
`/staff/today`, `/staff/appointments/new`, `/staff/walk-ins/new`,
`/staff/patients`, `/staff/queue?doctorId=`

Admin (requires CLINIC_ADMIN, inside the staff shell):
`/staff/settings`, `/staff/doctors`, `/staff/doctors/:id/schedule`,
`/staff/services`, `/staff/staff`, `/staff/reports`

Doctor (requires DOCTOR): `/doctor/today`, `/doctor/queue`

`/` redirects by role to the right home.

## Notes

- All API calls go through the typed wrapper in `src/api/client.ts`. No mocks
  are used.
- Queue screens poll every 20–30s for live updates.
- Slot booking uses a 5-minute hold (`POST /appointments/hold`) followed by
  `POST /appointments` with an idempotency key; a `409 SLOT_UNAVAILABLE`
  surfaces a friendly "that slot was just taken" message.
- Statuses use semantic colors via the `StatusBadge` component (never
  color-only: every badge also has a text label).
