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
| `VITE_CLINIC_ID` | `demo-clinic`                    | Clinic id for public doctor/service listings (must match the backend seed) |

The JWT is stored in `localStorage` under `clinic_token`. Every request attaches
`Authorization: Bearer <token>`; a `401` clears the token and redirects to the
appropriate login page (`/login` or `/staff/login`).

## Demo credentials

Patient login is phone + OTP. In dev mode the API returns a `devCode` in the
`POST /auth/request-otp` response, and the login screen displays it in a
"Demo code" box — enter it as the OTP. No real SMS is needed.

Staff / doctor login is at `/staff/login` (email or phone + password):

| Role         | Identifier            | Password      | Lands on        |
|--------------|-----------------------|---------------|-----------------|
| Receptionist | `reception@demo.clinic` | `reception123` | `/staff/today` |
| Clinic admin | `admin@demo.clinic`     | `admin123`     | `/staff/today` |
| Doctor       | (seeded doctor login)   | (per seed)     | `/doctor/today` |

These accounts come from the backend seed data — see the backend README.

## Login instructions

- **Patient:** open `/login`, enter a 10-digit mobile number (starts 6–9),
  tap "Send code", then enter the 6-digit code shown in the "Demo code" box.
- **Staff/doctor:** open `/staff/login`, enter identifier + password from the
  table above. Receptionists and admins land on the reception dashboard;
  doctors land on the doctor console.

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

- All API calls go through the typed wrapper in `src/api/client.ts`, which
  matches `../API_CONTRACT.md` exactly. No mocks anywhere.
- Queue screens poll every 20–30s for live updates.
- Slot booking uses a 5-minute hold (`POST /appointments/hold`) followed by
  `POST /appointments` with an idempotency key; a `409 SLOT_UNAVAILABLE`
  surfaces a friendly "that slot was just taken" message.
- Statuses use semantic colors via the `StatusBadge` component (never
  color-only: every badge also has a text label).
