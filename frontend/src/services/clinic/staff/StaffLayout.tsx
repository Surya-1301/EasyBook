import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../auth/AuthContext';
import { Button } from '../../../components/Button';
import { initials } from '../../../utils/format';

const clinicLinks = [
  { to: '/admin/today', label: 'Today' },
  { to: '/admin/queue', label: 'Queue' },
  { to: '/admin/appointments/new', label: 'Book Appointment' },
  { to: '/admin/walk-ins/new', label: 'Walk-in' },
  { to: '/admin/patients', label: 'Patients' },
];

const manageLinks = [
  { to: '/admin/doctors', label: 'Doctors' },
  { to: '/admin/services', label: 'Services' },
  { to: '/admin/staff', label: 'Staff' },
  { to: '/admin/reports', label: 'Reports' },
  { to: '/admin/settings', label: 'Settings' },
];

function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
          isActive ? 'bg-brand-500 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
        }`
      }
    >
      <span className="block h-2 w-2 shrink-0 rounded-full bg-current opacity-60" aria-hidden />
      {label}
    </NavLink>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="px-3 text-[11px] font-bold uppercase tracking-widest text-slate-500">{children}</p>
  );
}

export function StaffLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'CLINIC_ADMIN';
  const allLinks = isAdmin ? [...clinicLinks, ...manageLinks] : clinicLinks;

  const onLogout = () => {
    logout();
    navigate('/admin');
  };

  return (
    <div className="flex min-h-dvh bg-slate-100">
      <aside className="flex w-60 shrink-0 flex-col bg-[#0f172a] text-white max-lg:hidden">
        <div className="flex items-center gap-2.5 p-5">
          <img src="/logo-icon.png" alt="EasyBook logo" className="h-9 w-9 rounded-xl" />
          <div>
            <p className="text-base font-extrabold leading-tight">EasyBook</p>
            <p className="text-[11px] text-slate-400">Local business workspace</p>
          </div>
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto px-3" aria-label="Staff navigation">
          <div className="space-y-1">
            <SectionLabel>Clinic</SectionLabel>
            {clinicLinks.map((l) => (
              <NavItem key={l.to} to={l.to} label={l.label} />
            ))}
          </div>
          {isAdmin && (
            <div className="space-y-1">
              <SectionLabel>Manage</SectionLabel>
              {manageLinks.map((l) => (
                <NavItem key={l.to} to={l.to} label={l.label} />
              ))}
            </div>
          )}
        </nav>
        <div className="border-t border-slate-800 p-4">
          <Button variant="ghost" className="mb-2 w-full text-slate-300 hover:bg-slate-800" onClick={() => navigate('/services')}>
            Switch service
          </Button>
          <div className="flex items-center gap-3 rounded-xl bg-slate-800/70 px-3 py-2.5">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-bold"
              aria-hidden
            >
              {initials(user?.name || 'S')}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{user?.name}</p>
              <p className="truncate text-xs capitalize text-slate-400">
                {user?.role.replace('_', ' ').toLowerCase()}
              </p>
            </div>
          </div>
          <Button variant="ghost" className="mt-2 w-full text-slate-300 hover:bg-slate-800" onClick={onLogout}>
            Log out
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* mobile top bar */}
        <header className="flex items-center justify-between bg-[#0f172a] px-4 py-3 text-white lg:hidden">
          <div className="flex items-center gap-2">
            <img src="/logo-icon.png" alt="EasyBook logo" className="h-7 w-7 rounded-lg" />
            <p className="font-extrabold">EasyBook</p>
          </div>
          <div className="flex items-center gap-1"><Button variant="ghost" size="sm" className="text-slate-200" onClick={() => navigate('/services')}>Services</Button><Button variant="ghost" size="sm" className="text-slate-200" onClick={onLogout}>Log out</Button></div>
        </header>
        {/* mobile nav scroll */}
        <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-white px-2 py-2 lg:hidden" aria-label="Staff navigation mobile">
          {allLinks.map((l) => (
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
