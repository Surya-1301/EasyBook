import { Router } from "express";
import { z } from "zod";
import { db, row, rows } from "../../db";
import { ah, fail, ok } from "../../lib/http";
import { mergeSettings } from "../../types";
import { addDays, localDate, localDayOfWeek, timeToMinutes, minutesToTime } from "../../lib/time";
import { generateAvailability } from "../../services/availability";

const router = Router();

function shapeClinic(c: Record<string, unknown>) {
  return {
    id: c.id,
    name: c.name,
    logoUrl: c.logo_url,
    description: c.description,
    phone: c.phone,
    email: c.email,
    address: {
      line1: c.address_line_1,
      line2: c.address_line_2,
      city: c.city,
      state: c.state,
      postalCode: c.postal_code,
    },
    timezone: c.timezone,
    status: c.status,
    settings: mergeSettings((c.settings as string | null) ?? null),
  };
}

router.get(
  "/clinics/:clinicId",
  ah(async (req, res) => {
    const clinic = row<Record<string, unknown>>("SELECT * FROM clinics WHERE id = ?", req.params.clinicId);
    if (!clinic) return fail(res, 404, "NOT_FOUND", "Clinic not found.");
    return ok(res, 200, { clinic: shapeClinic(clinic) });
  })
);

interface DoctorRow {
  id: string;
  clinic_id: string;
  name: string;
  specialty: string;
  qualification: string | null;
  experience_years: number | null;
  languages: string | null;
  bio: string | null;
  photo_url: string | null;
  consultation_fee: number | null;
  status: string;
}

function shapeDoctorList(d: DoctorRow) {
  return {
    id: d.id,
    name: d.name,
    specialty: d.specialty,
    qualification: d.qualification,
    experienceYears: d.experience_years,
    languages: d.languages ? JSON.parse(d.languages) : [],
    bio: d.bio,
    photoUrl: d.photo_url,
    consultationFee: d.consultation_fee,
    nextAvailableSlot: nextAvailableSlot(d.id),
  };
}

/** First AVAILABLE slot in the next 7 clinic-local days. */
export function nextAvailableSlot(doctorId: string): string | null {
  const doctor = row<{ clinic_id: string }>("SELECT clinic_id FROM doctors WHERE id = ?", doctorId);
  if (!doctor) return null;
  const clinic = row<{ timezone: string }>("SELECT timezone FROM clinics WHERE id = ?", doctor.clinic_id);
  const tz = clinic?.timezone ?? "Asia/Kolkata";
  const today = localDate(Date.now(), tz);
  for (let i = 0; i < 7; i++) {
    const date = addDays(today, i);
    const avail = generateAvailability(doctorId, date);
    const slot = avail.slots.find((s) => s.status === "AVAILABLE");
    if (slot) return slot.startAt;
  }
  return null;
}

router.get(
  "/clinics/:clinicId/doctors",
  ah(async (req, res) => {
    const clinic = row("SELECT id FROM clinics WHERE id = ?", req.params.clinicId);
    if (!clinic) return fail(res, 404, "NOT_FOUND", "Clinic not found.");
    const doctors = rows<DoctorRow>(
      "SELECT * FROM doctors WHERE clinic_id = ? AND status = 'ACTIVE' ORDER BY name ASC",
      req.params.clinicId
    );
    return ok(res, 200, { doctors: doctors.map(shapeDoctorList) });
  })
);

router.get(
  "/clinics/:clinicId/services",
  ah(async (req, res) => {
    const clinic = row("SELECT id FROM clinics WHERE id = ?", req.params.clinicId);
    if (!clinic) return fail(res, 404, "NOT_FOUND", "Clinic not found.");
    const services = rows<Record<string, unknown>>(
      "SELECT * FROM services WHERE clinic_id = ? AND status = 'ACTIVE' ORDER BY name ASC",
      req.params.clinicId
    );
    return ok(res, 200, {
      services: services.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        durationMinutes: s.duration_minutes,
        fee: s.fee,
      })),
    });
  })
);

function scheduleSummary(doctorId: string): string {
  const scheds = rows<{ day_of_week: number; start_time: string; end_time: string }>(
    `SELECT day_of_week, start_time, end_time FROM recurring_schedules
     WHERE doctor_id = ? AND status = 'ACTIVE' ORDER BY day_of_week, start_time`,
    doctorId
  );
  if (scheds.length === 0) return "Schedule not set";
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const fmt = (t: string) => {
    const mins = timeToMinutes(t.slice(0, 5));
    const h24 = Math.floor(mins / 60);
    const mm = mins % 60;
    const suffix = h24 >= 12 ? "PM" : "AM";
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return mm === 0 ? `${h12} ${suffix}` : `${h12}:${String(mm).padStart(2, "0")} ${suffix}`;
  };
  const byDay = new Map<number, string[]>();
  for (const s of scheds) {
    const arr = byDay.get(s.day_of_week) ?? [];
    arr.push(`${fmt(s.start_time)}–${fmt(s.end_time)}`);
    byDay.set(s.day_of_week, arr);
  }
  // Group consecutive days with identical windows.
  const entries = [...byDay.entries()].sort((a, b) => a[0] - b[0]);
  const groups: Array<{ days: number[]; win: string }> = [];
  for (const [d, wins] of entries) {
    const win = wins.join(", ");
    const last = groups[groups.length - 1];
    if (last && last.win === win && last.days[last.days.length - 1] === d - 1) last.days.push(d);
    else groups.push({ days: [d], win });
  }
  return groups
    .map((g) => `${g.days.length > 1 ? `${days[g.days[0]]}–${days[g.days[g.days.length - 1]]}` : days[g.days[0]]} ${g.win}`)
    .join("; ");
}

router.get(
  "/doctors/:doctorId",
  ah(async (req, res) => {
    const d = row<DoctorRow>("SELECT * FROM doctors WHERE id = ? AND status = 'ACTIVE'", req.params.doctorId);
    if (!d) return fail(res, 404, "NOT_FOUND", "Doctor not found.");
    const services = rows<{ id: string; name: string; duration_minutes: number; fee: number | null }>(
      `SELECT s.id, s.name, s.duration_minutes, s.fee FROM services s
       JOIN doctor_services ds ON ds.service_id = s.id
       WHERE ds.doctor_id = ? AND s.status = 'ACTIVE'`,
      d.id
    );
    return ok(res, 200, {
      doctor: {
        ...shapeDoctorList(d),
        scheduleSummary: scheduleSummary(d.id),
        services: services.map((s) => ({
          id: s.id,
          name: s.name,
          durationMinutes: s.duration_minutes,
          fee: s.fee,
        })),
      },
    });
  })
);

const availabilityQuery = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  serviceId: z.string().uuid().optional(),
});

router.get(
  "/doctors/:doctorId/availability",
  ah(async (req, res) => {
    const parsed = availabilityQuery.safeParse(req.query);
    if (!parsed.success) {
      return fail(res, 400, "VALIDATION_ERROR", "A valid date (YYYY-MM-DD) is required.", {
        date: "Use format YYYY-MM-DD.",
      });
    }
    const doctor = row<DoctorRow>("SELECT * FROM doctors WHERE id = ?", req.params.doctorId);
    if (!doctor || doctor.status !== "ACTIVE") return fail(res, 404, "NOT_FOUND", "Doctor not found.");

    let duration: number | undefined;
    if (parsed.data.serviceId) {
      const svc = row<{ duration_minutes: number }>(
        "SELECT duration_minutes FROM services WHERE id = ? AND status = 'ACTIVE'",
        parsed.data.serviceId
      );
      if (!svc) return fail(res, 404, "NOT_FOUND", "Service not found.");
      duration = svc.duration_minutes;
    }

    const avail = generateAvailability(req.params.doctorId, parsed.data.date, duration);
    if (!avail.ok && avail.reason === "DOCTOR_INACTIVE") return fail(res, 404, "NOT_FOUND", "Doctor not found.");
    if (!avail.ok && avail.reason === "PAST_DATE") return fail(res, 400, "DOCTOR_NOT_AVAILABLE", "Date is in the past.");
    if (!avail.ok && avail.reason === "TOO_FAR") {
      return fail(res, 400, "DOCTOR_NOT_AVAILABLE", "Date is beyond the booking horizon.");
    }
    return ok(res, 200, { date: avail.date, slots: avail.slots });
  })
);

export default router;
export { minutesToTime };
