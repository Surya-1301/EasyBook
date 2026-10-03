import { NavLink, Outlet } from 'react-router-dom';
import type { ComponentType, SVGProps } from 'react';
import { IconCalendar, IconHome, IconUser } from '../components/icons';

const tabs: { to: string; label: string; icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { to: '/home', label: 'Home', icon: IconHome },
  { to: '/appointments', label: 'Appointments', icon: IconCalendar },
  { to: '/profile', label: 'Profile', icon: IconUser },
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
              className="flex min-h-[68px] flex-col items-center justify-center gap-1 pb-2 pt-2.5"
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`flex h-10 w-10 items-center justify-center rounded-full transition ${
                      isActive ? 'bg-brand-100' : 'bg-transparent'
                    }`}
                    aria-hidden
                  >
                    <t.icon
                      className={`h-5 w-5 transition ${
                        isActive ? 'text-brand-700' : 'text-slate-400'
                      }`}
                    />
                  </span>
                  <span
                    className={`text-xs font-semibold transition ${
                      isActive ? 'text-brand-700' : 'text-slate-400'
                    }`}
                  >
                    {t.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
