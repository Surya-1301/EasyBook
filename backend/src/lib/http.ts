import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "SLOT_UNAVAILABLE"
  | "APPOINTMENT_ALREADY_CANCELLED"
  | "APPOINTMENT_ALREADY_COMPLETED"
  | "CANNOT_RESCHEDULE"
  | "PATIENT_NOT_FOUND"
  | "DOCTOR_NOT_AVAILABLE"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export function fail(
  res: Response,
  status: number,
  code: ErrorCode,
  message: string,
  fieldErrors?: Record<string, string>
) {
  return res.status(status).json({ error: { code, message, ...(fieldErrors ? { fieldErrors } : {}) } });
}

export function ok(res: Response, status: number, body: unknown) {
  return res.status(status).json(body);
}

export function zodFieldErrors(err: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Wrap async route handlers so rejections hit the error middleware. */
export function ah(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export function isSqliteUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "SQLITE_CONSTRAINT_UNIQUE"
  );
}
