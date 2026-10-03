export type ServiceKind = 'clinic' | 'barber';

export type ServiceDefinition = {
  id: ServiceKind;
  name: string;
  shortName: string;
  description: string;
  accent: string;
  softAccent: string;
  icon: 'clinic' | 'barber';
};

export const SERVICE_DEFINITIONS: ServiceDefinition[] = [
  {
    id: 'clinic',
    name: 'Clinic',
    shortName: 'Care',
    description: 'Appointments, doctors, queues and patient care.',
    accent: 'teal',
    softAccent: 'bg-teal-50 text-teal-700 ring-teal-100',
    icon: 'clinic',
  },
  {
    id: 'barber',
    name: 'Barber shop',
    shortName: 'Style',
    description: 'Bookings, stylists, services and the daily chair plan.',
    accent: 'amber',
    softAccent: 'bg-amber-50 text-amber-700 ring-amber-100',
    icon: 'barber',
  },
];

const STORAGE_KEY = 'easybook.selected-service';

export function getSelectedService(): ServiceKind | null {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return SERVICE_DEFINITIONS.some((service) => service.id === stored) ? (stored as ServiceKind) : null;
}

export function setSelectedService(service: ServiceKind): void {
  window.localStorage.setItem(STORAGE_KEY, service);
}

export function clearSelectedService(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}

export function getServiceDefinition(service: ServiceKind): ServiceDefinition {
  return SERVICE_DEFINITIONS.find((definition) => definition.id === service) || SERVICE_DEFINITIONS[0];
}
