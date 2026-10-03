export type BarberBooking = { id: string; time: string; customer: string; service: string; stylist: string };
export type BarberTeamMember = { id: string; name: string; specialty: string };
type WorkspaceState = {
  barberBookings: BarberBooking[];
  barberTeam: BarberTeamMember[];
};

const STORAGE_KEY = 'easybook.workspace-data';

const initialState: WorkspaceState = {
  barberBookings: [],
  barberTeam: [],
};

function readState(): WorkspaceState {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (!value) return initialState;
    const stored = JSON.parse(value) as Partial<WorkspaceState>;
    const { kiranaOrders: _orders, kiranaProducts: _products, kiranaCustomers: _customers, ...cleanStored } = stored as Partial<WorkspaceState> & Record<string, unknown>;
    return {
      ...initialState,
      ...cleanStored,
      barberBookings: (stored.barberBookings || []).filter((booking) => !['b1', 'b2'].includes(booking.id)),
      barberTeam: (stored.barberTeam || []).filter((member) => !['t1', 't2'].includes(member.id)),
    };
  } catch {
    return initialState;
  }
}

export function loadWorkspaceState(): WorkspaceState {
  return readState();
}

export function saveWorkspaceState(state: WorkspaceState): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}
