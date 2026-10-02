import cors from "cors";
import express from "express";
import { config } from "./config";
import { db } from "./db";
import { fail } from "./lib/http";
import { nowIso } from "./lib/time";
import authRoutes from "./modules/auth/routes";
import patientsRoutes from "./modules/patients/routes";
import doctorsRoutes from "./modules/doctors/routes";
import appointmentsRoutes, { startHoldSweeper } from "./modules/appointments/routes";
import queueRoutes, { patientRouter as patientQueueRoutes } from "./modules/queue/routes";
import receptionRoutes from "./modules/reception/routes";
import doctorRoutes from "./modules/doctor/routes";
import adminRoutes from "./modules/admin/routes";

const app = express();

app.use(cors()); // dev: allow all origins
app.use(express.json({ limit: "1mb" }));

// Public misc endpoints
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/ready", (_req, res) => {
  try {
    db.prepare("SELECT 1").get();
    res.json({ ok: true, db: true });
  } catch {
    res.status(503).json({ ok: false, db: false });
  }
});

const v1 = "/api/v1";
app.use(`${v1}/auth`, authRoutes);
app.use(`${v1}/patients`, patientsRoutes);
app.use(`${v1}`, doctorsRoutes); // /clinics/*, /doctors/*
app.use(`${v1}/appointments`, appointmentsRoutes);
app.use(`${v1}/queue`, queueRoutes);
app.use(`${v1}/queue`, patientQueueRoutes); // GET /queue/my (PATIENT)
app.use(`${v1}/reception`, receptionRoutes);
app.use(`${v1}/doctor`, doctorRoutes);
app.use(`${v1}/admin`, adminRoutes);

// 404 for unknown API routes
app.use(v1, (_req, res) => fail(res, 404, "NOT_FOUND", "Endpoint not found."));

// Central error handler — consistent error shape
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const withHttp = err as { httpCode?: number; errorCode?: string; message?: string };
  if (withHttp.httpCode) {
    return fail(res, withHttp.httpCode, (withHttp.errorCode as never) ?? "INTERNAL_ERROR", withHttp.message ?? "Request failed.");
  }
  console.error("[error]", (err as Error)?.stack ?? err);
  return fail(res, 500, "INTERNAL_ERROR", "Something went wrong. Please try again.");
});

const server = app.listen(config.port, () => {
  console.log(`[clinic-api] listening on http://localhost:${config.port} (env=${config.nodeEnv})`);
});

// Background jobs (server-owned; never depend on a client staying open)
const holdSweeper = startHoldSweeper();
const revokedCleanup = setInterval(() => {
  try {
    db.prepare("DELETE FROM revoked_tokens WHERE expires_at < ?").run(nowIso());
  } catch (err) {
    console.error("[auth] revoked-token cleanup error:", (err as Error).message);
  }
}, 60 * 60 * 1000);
revokedCleanup.unref?.();

function shutdown() {
  clearInterval(holdSweeper);
  clearInterval(revokedCleanup);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

export default app;
