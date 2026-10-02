import { NavLink, Outlet } from 'react-router-dom';

const tabs = [
  { to: '/home', label: 'Home' },
  { to: '/appointments', label: 'Appointments' },
  { to: '/profile', label: 'Profile' },
];

export function PatientLayout() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col bg-slate-50">
      <main className="flex-1 pb-24">
        <Outlet />
      </main>
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur"
        aria-label="Patient navigation"
      >
        <div className="mx-auto grid max-w-lg grid-cols-3">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                `relative flex min-h-[64px] flex-col items-center justify-center gap-1 text-xs font-semibold ${
                  isActive ? 'text-brand-700' : 'text-slate-400'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`absolute top-0 h-1 w-10 rounded-b-full transition ${
                      isActive ? 'bg-brand-500' : 'bg-transparent'
                    }`}
                    aria-hidden
                  />
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-full transition ${
                      isActive ? 'bg-brand-100' : 'bg-transparent'
                    }`}
                    aria-hidden
                  >
                    <span
                      className={`block h-2.5 w-2.5 rounded-full transition ${
                        isActive ? 'bg-brand-600' : 'bg-slate-300'
                      }`}
                    />
                  </span>
                  {t.label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
