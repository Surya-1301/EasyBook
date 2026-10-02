import { NavLink, Outlet } from 'react-router-dom';

const tabs = [
  { to: '/home', label: 'Home', icon: '⌂' },
  { to: '/appointments', label: 'Appointments', icon: '📅' },
  { to: '/profile', label: 'Profile', icon: '👤' },
];

export function PatientLayout() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col bg-slate-50">
      <main className="flex-1 pb-24">
        <Outlet />
      </main>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white"
        aria-label="Patient navigation"
      >
        <div className="mx-auto grid max-w-lg grid-cols-3">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                `flex min-h-[64px] flex-col items-center justify-center gap-0.5 text-xs font-semibold ${
                  isActive ? 'text-brand-600' : 'text-slate-500'
                }`
              }
            >
              <span className="text-xl" aria-hidden>
                {t.icon}
              </span>
              {t.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
