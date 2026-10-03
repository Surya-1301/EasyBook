import { Router } from "express";
import { z } from "zod";
import { db, rows } from "../../db";
import { ah, fail, ok } from "../../lib/http";

const router = Router();
const querySchema = z.object({
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  location: z.string().trim().min(2).max(120).optional(),
  radiusKm: z.coerce.number().positive().max(100).default(10),
}).refine((value) => (value.latitude !== undefined && value.longitude !== undefined) || value.location, {
  message: "Location is required.",
});

type BusinessRow = {
  id: string;
  type: "clinic" | "barber";
  name: string;
  description: string | null;
  address: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  rating: number | null;
};

function distanceKm(
  latitude: number,
  longitude: number,
  business: BusinessRow & { latitude: number; longitude: number }
): number {
  const radians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const latitudeDelta = radians(business.latitude - latitude);
  const longitudeDelta = radians(business.longitude - longitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(latitude)) * Math.cos(radians(business.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

router.get(
  "/businesses/nearby",
  ah(async (req, res) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) return fail(res, 400, "VALIDATION_ERROR", "Latitude and longitude are required.");

    const { latitude, longitude, location, radiusKm } = parsed.data;
    const directoryBusinesses = rows<BusinessRow>(
      "SELECT id, type, name, description, address, city, latitude, longitude, rating FROM local_businesses WHERE status = 'ACTIVE' AND type = 'barber'"
    );
    const clinics = rows<{
      id: string;
      name: string;
      description: string | null;
      address_line_1: string;
      city: string;
      latitude: number | null;
      longitude: number | null;
    }>(
      "SELECT id, name, description, address_line_1, city, latitude, longitude FROM clinics WHERE status = 'ACTIVE'"
    ).map((clinic) => ({
      id: clinic.id,
      type: 'clinic' as const,
      name: clinic.name,
      description: clinic.description,
      address: clinic.address_line_1,
      city: clinic.city,
      latitude: clinic.latitude,
      longitude: clinic.longitude,
      rating: null,
    }));
    const allBusinesses = [...directoryBusinesses, ...clinics];
    const normalizedLocation = location?.toLowerCase();
    const businesses = allBusinesses
      .filter((business) => !normalizedLocation || `${business.address} ${business.city}`.toLowerCase().includes(normalizedLocation))
      .map((business) => ({
        ...business,
        distanceKm:
          latitude !== undefined && longitude !== undefined && business.latitude !== null && business.longitude !== null
            ? distanceKm(latitude, longitude, business as BusinessRow & { latitude: number; longitude: number })
            : null,
      }))
      .filter((business) =>
        location
          ? true
          : business.latitude !== null && business.longitude !== null && business.distanceKm !== null && business.distanceKm <= radiusKm
      )
      .sort((a, b) => (a.distanceKm ?? Number.POSITIVE_INFINITY) - (b.distanceKm ?? Number.POSITIVE_INFINITY))
      .map((business) => ({ ...business, distanceKm: business.distanceKm === null ? null : Number(business.distanceKm.toFixed(1)) }));

    return ok(res, 200, { businesses, radiusKm });
  })
);

export default router;
