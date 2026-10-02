import { randomUUID } from "crypto";
import type { Request } from "express";
import { db } from "../db";
import { nowIso } from "../lib/time";

export interface AuditInput {
  clinicId: string;
  actorUserId?: string | null;
  entityType: string;
  entityId?: string | null;
  action: string;
  oldValues?: unknown;
  newValues?: unknown;
  req?: Request;
}

export function audit(input: AuditInput): void {
  try {
    db.prepare(
      `INSERT INTO audit_logs
         (id, clinic_id, actor_user_id, entity_type, entity_id, action, old_values, new_values, ip_address, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      randomUUID(),
      input.clinicId,
      input.actorUserId ?? null,
      input.entityType,
      input.entityId ?? null,
      input.action,
      input.oldValues !== undefined ? JSON.stringify(input.oldValues) : null,
      input.newValues !== undefined ? JSON.stringify(input.newValues) : null,
      input.req?.ip ?? null,
      (input.req?.headers["user-agent"] as string | undefined) ?? null,
      nowIso()
    );
  } catch (err) {
    // Audit must never break the main flow.
    console.error("[audit] failed to write audit log:", (err as Error).message);
  }
}
