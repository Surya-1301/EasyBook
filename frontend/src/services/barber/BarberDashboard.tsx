import { useState } from 'react';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Modal } from '../../components/Modal';
import { IconCalendarPlus, IconClock, IconScissors, IconUsers } from '../../components/icons';
import { ServiceWorkspace } from '../shared/ServiceWorkspace';
import { createId, loadWorkspaceState, saveWorkspaceState, type BarberBooking, type BarberTeamMember } from '../shared/workspaceStore';

export function BarberDashboard() {
  const [state, setState] = useState(loadWorkspaceState);
  const [action, setAction] = useState<string | null>(null);
  const [customer, setCustomer] = useState('');
  const [service, setService] = useState('Haircut');
  const [stylist, setStylist] = useState('');

  function openAction(next: string) {
    setCustomer('');
    setService('Haircut');
    setStylist('');
    setAction(next);
  }

  function save() {
    const next = { ...state };
    if (action === 'team' && stylist.trim()) {
      next.barberTeam = [...state.barberTeam, { id: createId('stylist'), name: stylist.trim(), specialty: 'Team member' } as BarberTeamMember];
    } else if ((action === 'booking' || action === 'walk-in') && customer.trim()) {
      const booking: BarberBooking = { id: createId('booking'), time: action === 'walk-in' ? 'Now' : 'Next slot', customer: customer.trim(), service: service.trim() || 'Haircut', stylist: state.barberTeam[0]?.name || 'Any stylist' };
      next.barberBookings = [...state.barberBookings, booking];
    }
    setState(next);
    saveWorkspaceState(next);
    setAction(null);
  }

  return <>
    <ServiceWorkspace service="barber" data={{
      eyebrow: 'Barber shop workspace',
      title: 'Keep every chair moving.',
      intro: 'A calm view of today’s appointments, walk-ins and stylist availability.',
      stats: [[String(state.barberBookings.length), 'Bookings today'], ['04', 'Waiting now'], [String(Math.max(0, 8 - state.barberBookings.length)), 'Open slots']],
      actions: [
        { action: 'booking', label: 'New booking', description: 'Add a customer appointment', icon: IconCalendarPlus },
        { action: 'walk-in', label: 'Walk-in queue', description: 'Add someone waiting', icon: IconClock },
        { action: 'team', label: 'Team schedule', description: 'Manage your stylists', icon: IconUsers },
      ],
      schedule: state.barberBookings.map((booking) => [booking.time, booking.customer, booking.service, booking.stylist]),
      serviceIcon: <IconScissors className="h-5 w-5" />,
    }} onAction={openAction} />
    <Modal open={action !== null} onClose={() => setAction(null)} title={action === 'team' ? 'Add stylist' : action === 'walk-in' ? 'Add walk-in' : 'New booking'}>
      {action === 'setup' ? <p className="text-sm leading-6 text-slate-500">Your Barber workspace is ready. Bookings and team members are saved in this browser.</p> : action === 'team' ? <Input label="Stylist name" value={stylist} onChange={(e) => setStylist(e.target.value)} autoFocus /> : <div className="space-y-4"><Input label="Customer name" value={customer} onChange={(e) => setCustomer(e.target.value)} autoFocus /><Input label="Service" value={service} onChange={(e) => setService(e.target.value)} /></div>}
      {action === 'setup' ? <Button className="mt-5 w-full" onClick={() => setAction(null)}>Close</Button> : <Button className="mt-5 w-full" disabled={action === 'team' ? !stylist.trim() : !customer.trim()} onClick={save}>Save</Button>}
    </Modal>
  </>;
}
