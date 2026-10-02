// Types matching ~/workspace/clinic-app/API_CONTRACT.md exactly.

export type Role = 'PATIENT' | 'RECEPTIONIST' | 'CLINIC_ADMIN' | 'DOCTOR';

export type AppointmentStatus =
  | 'HELD'
  | 'BOOKED'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'WAITING'
  | 'IN_CONSULTATION'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'RESCHEDULED'
  | 'NO_SHOW'
  | 'EXPIRED';

export type QueueStatus =
  | 'WAITING'
  | 'CALLED'
  | 'IN_CONSULTATION'
  | 'COMPLETED'
  | 'SKIPPED'
  | 'CANCELLED'
  | 'NO_SHOW';

export type BookingSource = 'PATIENT_APP' | 'RECEPTION' | 'PHONE' | 'WALK_IN';

export type PaymentStatus =
  | 'PENDING'
  | 'PAID'
  | 'FAILED'
  | 'REFUNDED'
  | 'NOT_REQUIRED'
  | 'PAY_AT_CLINIC';

export type ExceptionType = 'LEAVE' | 'BLOCK' | 'CUSTOM_HOURS' | 'EXTRA_HOURS';

export type SlotStatus = 'AVAILABLE' | 'BOOKED' | 'BLOCKED';

export interface User {
  id: string;
  phone: string;
  role: Role;
  name: string;
  email?: string;
  clinicId?: string;
}

export interface Patient {
  id: string;
  fullName: string;
  phone: string;
  dateOfBirth?: string;
  gender?: string;
  relationship?: string;
  email?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
}

export interface Clinic {
  id: string;
  name: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  description?: string;
  openingHours?: string;
  logoUrl?: string;
  settings?: ClinicSettings;
}

export interface BookingPolicy {
  maxAdvanceDays?: number;
  minAdvanceMinutes?: number;
  cancellationCutoffMinutes?: number;
  rescheduleCutoffMinutes?: number;
}

export interface QueuePolicy {
  walkInsEnabled?: boolean;
  patientSelfCheckInEnabled?: boolean;
}

export interface ClinicSettings {
  booking?: BookingPolicy;
  queue?: QueuePolicy;
  notifications?: Record<string, unknown>;
}

export interface DoctorSummary {
  id: string;
  name: string;
  specialty: string;
  qualification?: string;
  experienceYears?: number;
  languages?: string[];
  bio?: string;
  photoUrl?: string;
  consultationFee: number;
  nextAvailableSlot?: string;
}

export interface Doctor extends DoctorSummary {
  scheduleSummary?: string;
  isActive?: boolean;
  clinicId?: string;
}

export interface Service {
  id: string;
  name: string;
  description?: string;
  durationMinutes: number;
  fee: number;
}

export interface Slot {
  startAt: string; // ISO UTC
  endAt: string; // ISO UTC
  status: SlotStatus;
}

export interface SlotHold {
  id: string;
  doctorId: string;
  startAt: string;
  endAt: string;
  holdExpiresAt: string;
}

export interface Appointment {
  id: string;
  appointmentNumber: string;
  clinicId: string;
  doctorId: string;
  patientId: string;
  serviceId: string;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
  bookingSource: BookingSource;
  tokenNumber?: number;
  notesForClinic?: string;
  cancellationReason?: string;
  paymentStatus: PaymentStatus;
  doctor: { id: string; name: string; specialty: string };
  patient: { id: string; fullName: string; phone: string };
  service: { id: string; name: string; durationMinutes: number; fee: number };
  queueTicket?: QueueTicket;
  payment?: unknown;
}

export interface QueueTicket {
  id: string;
  tokenNumber: number;
  status: QueueStatus;
  position: number;
  estimatedWaitMinutes: number;
  patient: { id: string; fullName: string; phone: string };
  appointmentId?: string;
  appointmentTime?: string;
  checkedInAt: string;
  calledAt?: string;
}

export interface ReceptionAppointment extends Appointment {
  queueStatus?: QueueStatus;
}

export interface DayStats {
  total: number;
  checkedIn: number;
  waiting: number;
  completed: number;
  cancelled: number;
  noShow: number;
}

export interface DoctorDayStats {
  total: number;
  completed: number;
  waiting: number;
  upcoming: number;
}

export interface RecurringSchedule {
  id?: string;
  dayOfWeek: number; // 0-6
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  breakStartTime?: string;
  breakEndTime?: string;
  slotDurationMinutes?: number;
}

export interface ScheduleException {
  id: string;
  date: string; // YYYY-MM-DD
  type: ExceptionType;
  startTime?: string;
  endTime?: string;
  reason?: string;
}

export interface StaffMember {
  id: string;
  name: string;
  email?: string;
  phone: string;
  role: Role;
  isActive?: boolean;
}

export interface ApiErrorShape {
  error: {
    code: string;
    message: string;
    fieldErrors?: Record<string, string>;
  };
}

export class ApiError extends Error {
  code: string;
  status: number;
  fieldErrors?: Record<string, string>;

  constructor(status: number, code: string, message: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}
