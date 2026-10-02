// Typed fetch wrapper for the clinic API.
// Reads base URL from VITE_API_URL (default http://localhost:4000/api/v1),
// attaches the JWT from localStorage, and routes 401s to a registered handler.

import { ApiError, ApiErrorShape } from './types';

const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:4000/api/v1';

export const TOKEN_KEY = 'clinic_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(fn: (() => void) | null) {
  unauthorizedHandler = fn;
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
};

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = new URL(API_BASE.replace(/\/$/, '') + path);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    }
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url.toString(), {
    method: opts.method || 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 401) {
    setToken(null);
    if (unauthorizedHandler) unauthorizedHandler();
    throw new ApiError(401, 'UNAUTHORIZED', 'Your session has expired. Please log in again.');
  }

  const text = await res.text();
  const data = text ? (JSON.parse(text) as T | ApiErrorShape) : ({} as T);

  if (!res.ok) {
    const err = data as ApiErrorShape;
    throw new ApiError(
      res.status,
      err?.error?.code || 'INTERNAL_ERROR',
      err?.error?.message || `Request failed (${res.status})`,
      err?.error?.fieldErrors
    );
  }

  return data as T;
}

export const api = {
  auth: {
    requestOtp: (phone: string) =>
      request<{ ok: boolean; expiresInSeconds: number; devCode?: string }>('/auth/request-otp', {
        method: 'POST',
        body: { phone },
      }),
    verifyOtp: (phone: string, code: string) =>
      request<{ token: string; user: import('./types').User }>('/auth/verify-otp', {
        method: 'POST',
        body: { phone, code },
      }),
    staffLogin: (identifier: string, password: string) =>
      request<{ token: string; user: import('./types').User }>('/auth/staff-login', {
        method: 'POST',
        body: { identifier, password },
      }),
    logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
    me: () => request<{ user: import('./types').User }>('/auth/me'),
  },

  patients: {
    me: () => request<{ patient: import('./types').Patient }>('/patients/me'),
    updateMe: (body: Partial<import('./types').Patient>) =>
      request<{ patient: import('./types').Patient }>('/patients/me', { method: 'PATCH', body }),
    family: () => request<{ family: import('./types').Patient[] }>('/patients/me/family'),
    addFamily: (body: { fullName: string; relationship: string; dateOfBirth?: string; gender?: string; phone?: string }) =>
      request<{ patient: import('./types').Patient }>('/patients/me/family', { method: 'POST', body }),
    updateFamily: (id: string, body: Partial<import('./types').Patient>) =>
      request<{ patient: import('./types').Patient }>(`/patients/me/family/${id}`, { method: 'PATCH', body }),
    deleteFamily: (id: string) => request<{ ok: boolean }>(`/patients/me/family/${id}`, { method: 'DELETE' }),
  },

  clinic: {
    get: (clinicId: string) => request<{ clinic: import('./types').Clinic }>(`/clinics/${clinicId}`),
    doctors: (clinicId: string) =>
      request<{ doctors: import('./types').DoctorSummary[] }>(`/clinics/${clinicId}/doctors`),
    services: (clinicId: string) =>
      request<{ services: import('./types').Service[] }>(`/clinics/${clinicId}/services`),
  },

  doctors: {
    get: (doctorId: string) => request<{ doctor: import('./types').Doctor }>(`/doctors/${doctorId}`),
    availability: (doctorId: string, date: string, serviceId?: string) =>
      request<{ date: string; slots: import('./types').Slot[] }>(`/doctors/${doctorId}/availability`, {
        query: { date, serviceId },
      }),
  },

  appointments: {
    hold: (body: { doctorId: string; serviceId: string; startAt: string; patientId: string }) =>
      request<{ hold: import('./types').SlotHold }>('/appointments/hold', { method: 'POST', body }),
    create: (body: {
      holdId?: string;
      doctorId?: string;
      serviceId?: string;
      startAt?: string;
      patientId?: string;
      notesForClinic?: string;
      idempotencyKey?: string;
    }) =>
      request<{ appointment: import('./types').Appointment }>('/appointments', { method: 'POST', body }),
    list: (scope: 'upcoming' | 'past' | 'cancelled') =>
      request<{ appointments: import('./types').Appointment[] }>('/appointments', { query: { scope } }),
    get: (id: string) => request<{ appointment: import('./types').Appointment }>(`/appointments/${id}`),
    cancel: (id: string, reason?: string) =>
      request<{ appointment: import('./types').Appointment }>(`/appointments/${id}/cancel`, {
        method: 'POST',
        body: { reason },
      }),
    reschedule: (id: string, newStartAt: string, holdId?: string) =>
      request<{ appointment: import('./types').Appointment; oldAppointment: import('./types').Appointment }>(
        `/appointments/${id}/reschedule`,
        { method: 'POST', body: { newStartAt, holdId } }
      ),
    checkIn: (id: string) =>
      request<{ appointment: import('./types').Appointment; queueTicket: import('./types').QueueTicket }>(
        `/appointments/${id}/check-in`,
        { method: 'POST' }
      ),
  },

  queue: {
    my: (appointmentId: string) =>
      request<{
        ticket: import('./types').QueueTicket;
        nowServingToken: number | null;
        patientsBefore: number;
        estimatedWaitMinutes: number;
        doctorName: string;
        appointmentTime: string;
      }>('/queue/my', { query: { appointmentId } }),
    list: (doctorId?: string, date?: string) =>
      request<{
        queue: import('./types').QueueTicket[];
        currentlyServing?: import('./types').QueueTicket;
        stats: Record<string, number>;
      }>('/queue', { query: { doctorId, date } }),
    call: (id: string) => request<{ ticket: import('./types').QueueTicket }>(`/queue/${id}/call`, { method: 'POST' }),
    recall: (id: string) =>
      request<{ ticket: import('./types').QueueTicket }>(`/queue/${id}/recall`, { method: 'POST' }),
    skip: (id: string) => request<{ ticket: import('./types').QueueTicket }>(`/queue/${id}/skip`, { method: 'POST' }),
    start: (id: string) => request<{ ticket: import('./types').QueueTicket }>(`/queue/${id}/start`, { method: 'POST' }),
    complete: (id: string) =>
      request<{ ticket: import('./types').QueueTicket }>(`/queue/${id}/complete`, { method: 'POST' }),
  },

  reception: {
    today: (date?: string) =>
      request<{
        date: string;
        stats: import('./types').DayStats;
        appointments: import('./types').ReceptionAppointment[];
      }>('/reception/today', { query: { date } }),
    createAppointment: (body: {
      patientId?: string;
      newPatient?: { fullName: string; phone: string; dateOfBirth?: string; gender?: string };
      doctorId: string;
      serviceId: string;
      startAt: string;
      bookingSource: 'PHONE' | 'RECEPTION';
      paymentStatus?: import('./types').PaymentStatus;
      notesForClinic?: string;
    }) => request<{ appointment: import('./types').Appointment }>('/reception/appointments', { method: 'POST', body }),
    walkIn: (body: {
      patientId?: string;
      newPatient?: { fullName: string; phone: string; dateOfBirth?: string; gender?: string };
      doctorId: string;
      serviceId?: string;
    }) =>
      request<{ queueTicket: import('./types').QueueTicket; appointment?: import('./types').Appointment }>(
        '/reception/walk-ins',
        { method: 'POST', body }
      ),
    checkIn: (id: string) =>
      request<{ appointment: import('./types').Appointment; queueTicket: import('./types').QueueTicket }>(
        `/reception/appointments/${id}/check-in`,
        { method: 'POST' }
      ),
    noShow: (id: string) =>
      request<{ appointment: import('./types').Appointment }>(`/reception/appointments/${id}/no-show`, {
        method: 'POST',
      }),
    cancel: (id: string, reason?: string) =>
      request<{ appointment: import('./types').Appointment }>(`/reception/appointments/${id}/cancel`, {
        method: 'POST',
        body: { reason },
      }),
    reschedule: (id: string, newStartAt: string) =>
      request<{ appointment: import('./types').Appointment }>(`/reception/appointments/${id}/reschedule`, {
        method: 'POST',
        body: { newStartAt },
      }),
    setDelay: (doctorId: string, delayMinutes: number, date?: string) =>
      request<{ ok: boolean; delayMinutes: number }>(`/reception/doctors/${doctorId}/delay`, {
        method: 'POST',
        body: { delayMinutes, date },
      }),
    patientsSearch: (q: string) =>
      request<{ patients: { id: string; fullName: string; phoneMasked: string; lastVisit?: string }[] }>(
        '/reception/patients/search',
        { query: { q } }
      ),
    createPatient: (body: { fullName: string; phone: string; dateOfBirth?: string; gender?: string }) =>
      request<{ patient: import('./types').Patient; duplicateWarning?: string }>('/reception/patients', {
        method: 'POST',
        body,
      }),
  },

  doctor: {
    today: () =>
      request<{
        date: string;
        stats: import('./types').DoctorDayStats;
        current?: import('./types').QueueTicket;
        next?: import('./types').QueueTicket;
        appointments: import('./types').Appointment[];
      }>('/doctor/me/today'),
    queue: () =>
      request<{
        queue: import('./types').QueueTicket[];
        currentlyServing?: import('./types').QueueTicket;
        stats: Record<string, number>;
      }>('/doctor/me/queue'),
    startVisit: (ticketId: string) =>
      request<{ ticket: import('./types').QueueTicket; appointment: import('./types').Appointment }>(
        `/doctor/queue/${ticketId}/start`,
        { method: 'POST' }
      ),
    completeVisit: (ticketId: string) =>
      request<{ ticket: import('./types').QueueTicket; appointment: import('./types').Appointment }>(
        `/doctor/queue/${ticketId}/complete`,
        { method: 'POST' }
      ),
    followUp: (appointmentId: string, body: { required: boolean; notes?: string }) =>
      request<{ appointment: import('./types').Appointment }>(`/doctor/appointments/${appointmentId}/follow-up`, {
        method: 'POST',
        body,
      }),
  },

  admin: {
    getClinic: () => request<{ clinic: import('./types').Clinic }>('/admin/clinic'),
    updateClinic: (body: Partial<import('./types').Clinic>) =>
      request<{ clinic: import('./types').Clinic }>('/admin/clinic', { method: 'PATCH', body }),
    doctors: () => request<{ doctors: import('./types').Doctor[] }>('/admin/doctors'),
    createDoctor: (body: Partial<import('./types').Doctor>) =>
      request<{ doctor: import('./types').Doctor }>('/admin/doctors', { method: 'POST', body }),
    updateDoctor: (id: string, body: Partial<import('./types').Doctor>) =>
      request<{ doctor: import('./types').Doctor }>(`/admin/doctors/${id}`, { method: 'PATCH', body }),
    setDoctorStatus: (id: string, isActive: boolean) =>
      request<{ doctor: import('./types').Doctor }>(`/admin/doctors/${id}/status`, {
        method: 'PATCH',
        body: { isActive },
      }),
    schedule: (doctorId: string) =>
      request<{
        recurring: import('./types').RecurringSchedule[];
        exceptions: import('./types').ScheduleException[];
      }>(`/admin/doctors/${doctorId}/schedule`),
    saveSchedule: (doctorId: string, schedules: import('./types').RecurringSchedule[]) =>
      request<{ recurring: import('./types').RecurringSchedule[] }>(`/admin/doctors/${doctorId}/schedule`, {
        method: 'POST',
        body: { schedules },
      }),
    addException: (doctorId: string, body: { date: string; type: import('./types').ExceptionType; startTime?: string; endTime?: string; reason?: string }) =>
      request<{ exception: import('./types').ScheduleException }>(`/admin/doctors/${doctorId}/exceptions`, {
        method: 'POST',
        body,
      }),
    deleteException: (doctorId: string, exceptionId: string) =>
      request<{ ok: boolean }>(`/admin/doctors/${doctorId}/exceptions/${exceptionId}`, { method: 'DELETE' }),
    services: () => request<{ services: import('./types').Service[] }>('/admin/services'),
    createService: (body: { name: string; description?: string; durationMinutes: number; fee: number }) =>
      request<{ service: import('./types').Service }>('/admin/services', { method: 'POST', body }),
    updateService: (id: string, body: Partial<import('./types').Service>) =>
      request<{ service: import('./types').Service }>(`/admin/services/${id}`, { method: 'PATCH', body }),
    deleteService: (id: string) => request<{ ok: boolean }>(`/admin/services/${id}`, { method: 'DELETE' }),
    staff: () => request<{ staff: import('./types').StaffMember[] }>('/admin/staff'),
    createStaff: (body: { name: string; email?: string; phone: string; password: string; role: import('./types').Role }) =>
      request<{ staff: import('./types').StaffMember }>('/admin/staff', { method: 'POST', body }),
    updateStaff: (id: string, body: Partial<import('./types').StaffMember>) =>
      request<{ staff: import('./types').StaffMember }>(`/admin/staff/${id}`, { method: 'PATCH', body }),
    reportsToday: () =>
      request<{ stats: import('./types').DayStats; byDoctor: { doctorId: string; doctorName: string; total: number; completed: number; waiting: number; checkedIn: number; cancelled: number; noShow: number }[] }>(
        '/admin/reports/today'
      ),
  },
};
