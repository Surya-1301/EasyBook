# Clinic App — API Contract V1

Base URL: `http://localhost:4000/api/v1` (frontend reads `VITE_API_URL`, defaults to this).
All timestamps: ISO 8601 UTC. Money: numbers (INR). IDs: UUID strings.

## Auth

Header: `Authorization: Bearer <jwt>` (all endpoints except those marked PUBLIC).

- `POST /auth/request-otp` — PUBLIC. Body: `{ phone }`. Creates 6-digit OTP (5-min expiry, 5 attempts).
  Dev mode (`NODE_ENV=development`): response includes `devCode` so testers can log in.
  → `200 { ok: true, expiresInSeconds: 300, devCode?: "123456" }`
- `POST /auth/verify-otp` — PUBLIC. Body: `{ phone, code }`.
  → `200 { token, user: { id, phone, role, name } }`
- `POST /auth/staff-login` — PUBLIC. Body: `{ identifier, password }` (identifier = email or phone).
  → `200 { token, user: { id, phone, email, role, name, clinicId } }`
- `POST /auth/logout` → `200 { ok: true }`
- `GET  /auth/me` → `200 { user }`

Roles: `PATIENT | RECEPTIONIST | CLINIC_ADMIN | DOCTOR`.
Role guard: staff endpoints require RECEPTIONIST+ (receptionist, admin); `/admin/*` requires CLINIC_ADMIN;
`/doctor/*` requires DOCTOR; patient endpoints require PATIENT (staff may use reception endpoints instead).

Error shape (all errors): `{ error: { code, message, fieldErrors? } }`
Codes: UNAUTHORIZED, FORBIDDEN, NOT_FOUND, VALIDATION_ERROR, SLOT_UNAVAILABLE,
APPOINTMENT_ALREADY_CANCELLED, APPOINTMENT_ALREADY_COMPLETED, CANNOT_RESCHEDULE,
PATIENT_NOT_FOUND, DOCTOR_NOT_AVAILABLE, RATE_LIMITED, INTERNAL_ERROR.

## Enums

- AppointmentStatus: `HELD | BOOKED | CONFIRMED | CHECKED_IN | WAITING | IN_CONSULTATION | COMPLETED | CANCELLED | RESCHEDULED | NO_SHOW | EXPIRED`
- QueueStatus: `WAITING | CALLED | IN_CONSULTATION | COMPLETED | SKIPPED | CANCELLED | NO_SHOW`
- BookingSource: `PATIENT_APP | RECEPTION | PHONE | WALK_IN`
- PaymentStatus: `PENDING | PAID | FAILED | REFUNDED | NOT_REQUIRED | PAY_AT_CLINIC`
- ExceptionType: `LEAVE | BLOCK | CUSTOM_HOURS | EXTRA_HOURS`

## Patient (role PATIENT)

- `GET /patients/me` → `{ patient: Patient }` (auto-creates profile from user phone/name on first call)
- `PATCH /patients/me` — Body: `{ fullName?, dateOfBirth?, gender?, email?, emergencyContactName?, emergencyContactPhone? }`
- `GET /patients/me/family` → `{ family: Patient[] }`
- `POST /patients/me/family` — Body: `{ fullName, relationship, dateOfBirth?, gender?, phone? }` → `{ patient }`
- `PATCH /patients/me/family/:id` → `{ patient }`
- `DELETE /patients/me/family/:id` → `{ ok: true }`

Patient: `{ id, fullName, phone, dateOfBirth, gender, relationship, emergencyContactName, emergencyContactPhone }`

## Clinic / doctors / services (PUBLIC reads)

- `GET /clinics/:clinicId` → `{ clinic }`
- `GET /clinics/:clinicId/doctors` → `{ doctors: [{ id, name, specialty, qualification, experienceYears, languages, bio, photoUrl, consultationFee, nextAvailableSlot }] }`
- `GET /clinics/:clinicId/services` → `{ services: [{ id, name, description, durationMinutes, fee }] }`
- `GET /doctors/:doctorId` → `{ doctor: { ..., scheduleSummary } }`
- `GET /doctors/:doctorId/availability?date=YYYY-MM-DD&serviceId=` → `{ date, slots: [{ startAt, endAt, status: "AVAILABLE"|"BOOKED"|"BLOCKED" }] }`
  Only future slots within booking policy are returned; past slots excluded.

## Appointments (role PATIENT; patientId must belong to caller or their family)

- `POST /appointments/hold` — Body: `{ doctorId, serviceId, startAt, patientId }`.
  → `201 { hold: { id, doctorId, startAt, endAt, holdExpiresAt } }`
  409 `{ error: { code: "SLOT_UNAVAILABLE" } }` if taken. Hold TTL 5 min.
- `POST /appointments` — Body: `{ holdId, notesForClinic? }` or `{ doctorId, serviceId, startAt, patientId, notesForClinic?, idempotencyKey? }`.
  → `201 { appointment }`
- `GET /appointments?scope=upcoming|past|cancelled` → `{ appointments }`
- `GET /appointments/:id` → `{ appointment }` (includes doctor, clinic, patient, service, queueTicket?, payment)
- `POST /appointments/:id/cancel` — Body: `{ reason? }` → `{ appointment }`
- `POST /appointments/:id/reschedule` — Body: `{ newStartAt, holdId? }` → `{ appointment: <new>, oldAppointment }`
- `POST /appointments/:id/check-in` → `{ appointment, queueTicket }`

Appointment: `{ id, appointmentNumber, clinicId, doctorId, patientId, serviceId, startAt, endAt,
status, bookingSource, tokenNumber?, notesForClinic?, cancellationReason?, paymentStatus,
doctor: {id,name,specialty}, patient: {id,fullName,phone}, service: {id,name,durationMinutes,fee} }`

## Reception (roles RECEPTIONIST, CLINIC_ADMIN)

- `GET /reception/today?date=YYYY-MM-DD` → `{ date, stats: { total, checkedIn, waiting, completed, cancelled, noShow }, appointments: [{ ...appt, patient, queueStatus, tokenNumber }] }`
- `POST /reception/appointments` — Body: `{ patientId? | newPatient: {fullName, phone, ...}, doctorId, serviceId, startAt, bookingSource: "PHONE"|"RECEPTION", paymentStatus?, notesForClinic? }` → `201 { appointment }` (409 SLOT_UNAVAILABLE on race)
- `POST /reception/walk-ins` — Body: `{ patientId? | newPatient, doctorId, serviceId? }` → `201 { queueTicket, appointment? }` (creates queue ticket; appointment optional/linked)
- `POST /reception/appointments/:id/check-in` → `{ appointment, queueTicket }`
- `POST /reception/appointments/:id/no-show` → `{ appointment }`
- `POST /reception/appointments/:id/cancel` — Body: `{ reason? }` → `{ appointment }`
- `POST /reception/appointments/:id/reschedule` — Body: `{ newStartAt }` → `{ appointment }`
- `POST /reception/doctors/:doctorId/delay` — Body: `{ delayMinutes, date? }` → `{ ok: true, delayMinutes }`
- `POST /reception/doctors/:doctorId/block-slot` — Body: `{ date, startTime: "HH:MM", endTime: "HH:MM", reason? }` → `201 { exception }`
- `GET /reception/patients/search?q=` → `{ patients: [{ id, fullName, phoneMasked, lastVisit }] }`
- `POST /reception/patients` — Body: `{ fullName, phone, dateOfBirth?, gender? }` → `201 { patient, duplicateWarning? }`

## Queue (roles RECEPTIONIST, CLINIC_ADMIN, DOCTOR)

- `GET /queue?doctorId=&date=YYYY-MM-DD` → `{ queue: [{ ticket }], currentlyServing?, stats }`
- `POST /queue/:id/call` | `/recall` | `/skip` | `/start` | `/complete` → `{ ticket }`
- `POST /queue/reorder` — Body: `{ ticketId, newPosition, reason }` → `{ ok: true }` (audit-logged)

Ticket: `{ id, tokenNumber, status, position, estimatedWaitMinutes, patient: {id, fullName, phone},
appointmentId?, appointmentTime?, checkedInAt, calledAt? }`

Patient queue view: `GET /queue/my?appointmentId=` (role PATIENT) →
`{ ticket, nowServingToken, patientsBefore, estimatedWaitMinutes, doctorName, appointmentTime }`

## Doctor (role DOCTOR)

- `GET /doctor/me/today` → `{ date, stats: { total, completed, waiting, upcoming }, current?, next?, appointments }`
- `GET /doctor/me/queue` → same shape as GET /queue for own id + today
- `POST /doctor/queue/:id/start` → `{ ticket, appointment }`
- `POST /doctor/queue/:id/complete` → `{ ticket, appointment }`
- `POST /doctor/appointments/:id/follow-up` — Body: `{ required: boolean, notes? }` → `{ appointment }`

## Admin (role CLINIC_ADMIN)

- `GET /admin/clinic` / `PATCH /admin/clinic` — clinic fields + `settings: { booking: { maxAdvanceDays, minAdvanceMinutes, cancellationCutoffMinutes, rescheduleCutoffMinutes }, queue: { walkInsEnabled, patientSelfCheckInEnabled }, notifications: {...} }`
- `GET /admin/doctors` / `POST /admin/doctors` / `PATCH /admin/doctors/:id` / `PATCH /admin/doctors/:id/status`
- `GET /admin/doctors/:id/schedule` → `{ recurring: [...], exceptions: [...] }`
- `POST /admin/doctors/:id/schedule` — Body: `{ schedules: [{ dayOfWeek 0-6, startTime, endTime, breakStartTime?, breakEndTime?, slotDurationMinutes? }] }` (replaces)
- `POST /admin/doctors/:id/exceptions` — Body: `{ date, type, startTime?, endTime?, reason? }`
- `DELETE /admin/doctors/:id/exceptions/:exceptionId`
- `GET /admin/services` / `POST /admin/services` / `PATCH /admin/services/:id` / `DELETE /admin/services/:id`
- `GET /admin/staff` / `POST /admin/staff` — Body: `{ name, email?, phone, password, role }` / `PATCH /admin/staff/:id`
- `GET /admin/reports/today` → `{ stats, byDoctor: [...] }`
- `GET /admin/audit-logs?limit=` → `{ logs }`

RecurringSchedule: `{ id, dayOfWeek, startTime: "HH:MM", endTime: "HH:MM", breakStartTime?, breakEndTime?, slotDurationMinutes? }`

## Misc

- `GET /health` → `{ ok: true }` (PUBLIC)
- `GET /ready` → `{ ok: true, db: true }` (PUBLIC)
