import dotenv from "dotenv";

dotenv.config();

export const config = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-me",
  nodeEnv: process.env.NODE_ENV || "development",
  dbPath: process.env.DB_PATH || "data/clinic.db",
  holdTtlMinutes: Number(process.env.HOLD_TTL_MINUTES || 5),
  jwtExpiresIn: "24h" as const,
};

export const isDev = config.nodeEnv === "development";

if (config.nodeEnv === "production" && !process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET must be set in production");
}
