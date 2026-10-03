import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../auth/AuthContext';
import { Button } from '../../../components/Button';

export function DoctorLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const onLogout = () => {
    logout();
    navigate('/admin');
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col bg-slate-50">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div>
          <p className="font-bold text-slate-900">Dr. {user?.name}</p>
          <p className="text-xs text-slate-500">Doctor console</p>
        </div>
        <div className="flex items-center gap-1"><Button variant="ghost" size="sm" onClick={() => navigate('/services')}>Services</Button><Button variant="ghost" size="sm" onClick={onLogout}>Log out</Button></div>
      </header>
      <nav className="flex gap-2 border-b border-slate-200 bg-white px-4 py-2" aria-label="Doctor navigation">
        {[
          { to: '/doctor/today', label: 'Today' },
          { to: '/doctor/queue', label: 'Queue' },
        ].map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === '/doctor/today'}
            className={({ isActive }) =>
              `rounded-lg px-4 py-2.5 text-sm font-semibold ${isActive ? 'bg-brand-100 text-brand-700' : 'text-slate-600'}`
            }
          >
            {l.label}
          </NavLink>
        ))}
      </nav>
      <main className="flex-1 p-4">
        <Outlet />
      </main>
    </div>
  );
}
