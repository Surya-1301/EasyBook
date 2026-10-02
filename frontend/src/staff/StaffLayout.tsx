import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';

const baseLinks = [
  { to: '/staff/today', label: 'Dashboard', icon: '📊' },
  { to: '/staff/queue', label: 'Queue', icon: '🧾' },
  { to: '/staff/patients', label: 'Patients', icon: '👥' },
  { to: '/staff/appointments/new', label: 'Book Appointment', icon: '➕' },
  { to: '/staff/walk-ins/new', label: 'Walk-in', icon: '🚶' },
];

const adminLinks = [
  { to: '/staff/doctors', label: 'Doctors', icon: '🩺' },
  { to: '/staff/services', label: 'Services', icon: '💊' },
  { to: '/staff/staff', label: 'Staff', icon: '🧑‍⚕️' },
  { to: '/staff/reports', label: 'Reports', icon: '📈' },
  { to: '/staff/settings', label: 'Settings', icon: '⚙️' },
];

export function StaffLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'CLINIC_ADMIN';
  const links = isAdmin ? [...baseLinks, ...adminLinks] : baseLinks;

  const onLogout = () => {
    logout();
    navigate('/staff/login');
  };

  return (
    <div className="flex min-h-dvh bg-slate-100">
      <aside className="flex w-60 shrink-0 flex-col bg-slate-900 text-white max-lg:hidden">
        <div className="p-5">
          <p className="text-lg font-bold">Clinic Desk</p>
          <p className="mt-0.5 text-xs text-slate-400">
            {user?.name} • {user?.role.replace('_', ' ')}
          </p>
        </div>
        <nav className="flex-1 space-y-1 px-3" aria-label="Staff navigation">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${
                  isActive ? 'bg-brand-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                }`
              }
            >
              <span aria-hidden>{l.icon}</span>
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4">
          <Button variant="ghost" className="w-full text-slate-200 hover:bg-slate-800" onClick={onLogout}>
            Log out
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* mobile top bar */}
        <header className="flex items-center justify-between bg-slate-900 px-4 py-3 text-white lg:hidden">
          <p className="font-bold">Clinic Desk</p>
          <Button variant="ghost" size="sm" className="text-slate-200" onClick={onLogout}>
            Log out
          </Button>
        </header>
        {/* mobile nav scroll */}
        <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-2 py-2 lg:hidden" aria-label="Staff navigation mobile">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                `whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${
                  isActive ? 'bg-brand-100 text-brand-700' : 'text-slate-600'
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        <main className="flex-1 p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
