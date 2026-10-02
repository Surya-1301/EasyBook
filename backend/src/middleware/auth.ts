import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { db, row } from "../db";
import { fail } from "../lib/http";
import type { AuthUser, Role } from "../types";

interface JwtPayload {
  sub: string;
  role: Role;
  jti: string;
  iat: number;
  exp: number;
}

export function signToken(user: {
  id: string;
  role: Role;
  phone: string | null;
  email: string | null;
}): string {
  const jti = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return jwt.sign({ sub: user.id, role: user.role, jti }, config.jwtSecret, {
    algorithm: "HS256",
    expiresIn: config.jwtExpiresIn,
  });
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return fail(res, 401, "UNAUTHORIZED", "Authentication required.");

  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] }) as JwtPayload;
  } catch {
    return fail(res, 401, "UNAUTHORIZED", "Invalid or expired token.");
  }

  const revoked = row<{ jti: string }>("SELECT jti FROM revoked_tokens WHERE jti = ?", payload.jti);
  if (revoked) return fail(res, 401, "UNAUTHORIZED", "Session has been revoked.");

  const user = row<{
    id: string;
    phone: string | null;
    email: string | null;
    name: string | null;
    role: Role;
    status: string;
  }>("SELECT id, phone, email, name, role, status FROM users WHERE id = ?", payload.sub);
  if (!user || user.status !== "ACTIVE") {
    return fail(res, 401, "UNAUTHORIZED", "Account is not active.");
  }

  const staff = row<{ clinic_id: string }>(
    "SELECT clinic_id FROM clinic_staff WHERE user_id = ? AND status = 'ACTIVE' LIMIT 1",
    user.id
  );
  const doctor = row<{ id: string }>("SELECT id FROM doctors WHERE user_id = ?", user.id);

  req.user = {
    id: user.id,
    role: user.role,
    phone: user.phone,
    email: user.email,
    name: user.name,
    clinicId: staff?.clinic_id ?? null,
    doctorId: doctor?.id ?? null,
  } satisfies AuthUser;
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return fail(res, 401, "UNAUTHORIZED", "Authentication required.");
    if (!roles.includes(req.user.role)) {
      return fail(res, 403, "FORBIDDEN", "You do not have permission for this action.");
    }
    next();
  };
}

/** Staff roles: receptionist or clinic admin. */
export const requireStaff = requireRole("RECEPTIONIST", "CLINIC_ADMIN");
