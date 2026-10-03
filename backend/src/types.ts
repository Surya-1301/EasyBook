export type Role = "PATIENT" | "RECEPTIONIST" | "CLINIC_ADMIN" | "DOCTOR";
export type ServiceType = "clinic" | "barber";

export interface AuthUser {
  id: string;
  role: Role;
  phone: string | null;
  email: string | null;
  name: string | null;
  clinicId: string | null;
  doctorId: string | null;
  serviceType: ServiceType | null;
  workspaceId: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const ACTIVE_APPOINTMENT_STATUSES = [
  "HELD",
  "BOOKED",
  "CONFIRMED",
  "CHECKED_IN",
  "WAITING",
  "IN_CONSULTATION",
] as const;

export const ACTIVE_QUEUE_STATUSES = ["WAITING", "CALLED", "IN_CONSULTATION"] as const;

export interface ClinicSettings {
  booking: {
    maxAdvanceDays: number;
    minAdvanceMinutes: number;
    cancellationCutoffMinutes: number;
    rescheduleCutoffMinutes: number;
    autoConfirm: boolean;
  };
  queue: { walkInsEnabled: boolean; patientSelfCheckInEnabled: boolean };
  notifications: {
    confirmationEnabled: boolean;
    reminderEnabled: boolean;
    delayNotificationEnabled: boolean;
  };
}

export const DEFAULT_SETTINGS: ClinicSettings = {
  booking: {
    maxAdvanceDays: 30,
    minAdvanceMinutes: 30,
    cancellationCutoffMinutes: 60,
    rescheduleCutoffMinutes: 60,
    autoConfirm: true,
  },
  queue: { walkInsEnabled: true, patientSelfCheckInEnabled: true },
  notifications: { confirmationEnabled: true, reminderEnabled: true, delayNotificationEnabled: true },
};

export function mergeSettings(raw: string | null): ClinicSettings {
  if (!raw) return structuredClone(DEFAULT_SETTINGS);
  try {
    const parsed = JSON.parse(raw) as Partial<ClinicSettings>;
    return {
      booking: { ...DEFAULT_SETTINGS.booking, ...(parsed.booking ?? {}) },
      queue: { ...DEFAULT_SETTINGS.queue, ...(parsed.queue ?? {}) },
      notifications: { ...DEFAULT_SETTINGS.notifications, ...(parsed.notifications ?? {}) },
    };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}
