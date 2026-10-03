import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/Button';
import { IconCalendar } from '../../components/icons';
import { getServiceDefinition, type ServiceKind } from '../service';

type WorkspaceItem = {
  action: string;
  label: string;
  description: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
};

type WorkspaceData = {
  eyebrow: string;
  title: string;
  intro: string;
  stats: Array<[string, string]>;
  actions: Array<WorkspaceItem>;
  schedule: Array<[string, string, string, string]>;
  serviceIcon: ReactNode;
};

export function ServiceWorkspace({ service, data, onAction }: { service: Exclude<ServiceKind, 'clinic'>; data: WorkspaceData; onAction: (action: string) => void }) {
  const navigate = useNavigate();
  const definition = getServiceDefinition(service);

  return (
    <div className="min-h-dvh bg-[#f7f7f4] text-slate-900">
      <header className="border-b border-slate-200/80 bg-white/90 px-5 py-4 backdrop-blur lg:px-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/logo-icon.png" alt="EasyBook logo" className="h-10 w-10 rounded-xl" />
            <div><p className="text-sm font-extrabold tracking-tight">EasyBook</p><p className="text-xs text-slate-500">{definition.name}</p></div>
          </div>
          <Button variant="secondary" size="sm" onClick={() => navigate('/services')}>Switch service</Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8 lg:px-10 lg:py-12">
        <section className="overflow-hidden rounded-[2rem] bg-slate-900 px-6 py-8 text-white shadow-xl shadow-slate-900/10 lg:px-10 lg:py-10">
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="max-w-2xl"><p className="text-sm font-semibold text-amber-300">{data.eyebrow}</p><h1 className="mt-3 max-w-xl text-4xl font-black tracking-tight lg:text-6xl">{data.title}</h1><p className="mt-4 max-w-lg text-base leading-7 text-slate-300">{data.intro}</p></div>
            <div className="rounded-2xl bg-white/10 p-5 ring-1 ring-white/10"><p className="text-xs font-semibold text-slate-300">Today</p><p className="mt-1 text-2xl font-black">Monday, 03 Oct</p><p className="mt-1 text-sm text-slate-400">Open until 9:00 PM</p></div>
          </div>
        </section>

        <section className="mt-7 grid gap-3 sm:grid-cols-3">{data.stats.map(([value, label]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-3xl font-black tracking-tight">{value}</p><p className="mt-1 text-sm text-slate-500">{label}</p></div>)}</section>

        <section className="mt-10"><div><p className="text-sm font-semibold text-slate-500">Shortcuts</p><h2 className="mt-1 text-2xl font-black tracking-tight">What needs your attention?</h2></div><div className="mt-4 grid gap-3 md:grid-cols-3">{data.actions.map(({ action, label, description, icon: Icon }) => <button key={label} type="button" onClick={() => onAction(action)} className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg hover:shadow-slate-900/5"><span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ring-1 ${definition.softAccent}`}><Icon className="h-5 w-5" /></span><span><span className="block font-bold">{label}</span><span className="mt-1 block text-sm text-slate-500">{description}</span></span></button>)}</div></section>

        <section className="mt-10 grid gap-6 lg:grid-cols-[1fr_0.8fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-slate-500">Live view</p><h2 className="mt-1 text-xl font-black">Today’s activity</h2></div><IconCalendar className="h-5 w-5 text-slate-400" /></div><div className="mt-5 divide-y divide-slate-100">{data.schedule.map(([time, name, detail, status]) => <div key={`${time}-${name}`} className="grid grid-cols-[74px_1fr_auto] items-center gap-3 py-4"><p className="text-xs font-bold text-slate-400">{time}</p><div><p className="font-semibold">{name}</p><p className="mt-0.5 text-sm text-slate-500">{detail}</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{status}</span></div>)}</div></div>
          <div className="rounded-2xl bg-white p-6 ring-1 ring-slate-200"><span className={`flex h-12 w-12 items-center justify-center rounded-2xl ring-1 ${definition.softAccent}`}>{data.serviceIcon}</span><h2 className="mt-5 text-xl font-black">Make EasyBook yours</h2><p className="mt-2 text-sm leading-6 text-slate-500">Add your team, services and opening hours to turn this workspace into your daily operating system.</p><Button className="mt-5" variant="secondary" onClick={() => onAction('setup')}>Set up workspace</Button></div>
        </section>
      </main>
    </div>
  );
}
