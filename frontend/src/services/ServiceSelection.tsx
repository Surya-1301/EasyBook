import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { IconScissors, IconStethoscope } from '../components/icons';
import { SERVICE_DEFINITIONS, setSelectedService, type ServiceDefinition, type ServiceKind } from './service';

const icons = { clinic: IconStethoscope, barber: IconScissors };

export function ServiceSelection() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function choose(service: ServiceKind) {
    setSelectedService(service);
    if (service === 'clinic') {
      navigate('/workspace/clinic');
      return;
    }
    navigate(`/workspace/${service}`);
  }

  return (
    <div className="min-h-dvh bg-[#f5f8f6] px-5 py-6 text-slate-900 lg:px-10 lg:py-10">
      <header className="mx-auto flex max-w-6xl items-center justify-between"><div className="flex items-center gap-3"><img src="/logo-icon.png" alt="EasyBook logo" className="h-10 w-10 rounded-xl bg-white shadow-sm" /><div><p className="text-lg font-black tracking-tight">EasyBook</p><p className="text-xs text-slate-500">One home for local services</p></div></div><Button variant="ghost" size="sm" onClick={() => { logout(); navigate('/login'); }}>Log out</Button></header>
      <main className="mx-auto max-w-6xl py-12 lg:py-20"><div className="max-w-2xl"><p className="text-sm font-bold text-teal-700">Good to see you{user?.name ? `, ${user.name.split(' ')[0]}` : ''}</p><h1 className="mt-3 text-4xl font-black tracking-tight sm:text-6xl">What are you here to manage?</h1><p className="mt-5 max-w-xl text-base leading-7 text-slate-500">Choose a workspace to open your day. You can switch between services whenever you need.</p></div><div className="mt-10 grid gap-4 lg:grid-cols-4">{SERVICE_DEFINITIONS.map((service) => <ServiceCard key={service.id} service={service} onChoose={choose} />)}<button type="button" className="group flex min-h-[250px] flex-col items-start justify-between rounded-[1.75rem] border border-dashed border-slate-300 bg-white/50 p-6 text-left transition hover:border-slate-500 hover:bg-white"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-2xl text-slate-400">+</span><span><span className="block text-xl font-black">Add a service</span><span className="mt-2 block max-w-xs text-sm leading-6 text-slate-500">Set up another kind of local business in your EasyBook home.</span></span></button></div></main>
    </div>
  );
}

function ServiceCard({ service, onChoose }: { service: ServiceDefinition; onChoose: (service: ServiceKind) => void }) {
  const Icon = icons[service.icon];
  return <button type="button" onClick={() => onChoose(service.id)} className="group flex min-h-[250px] flex-col items-start justify-between rounded-[1.75rem] border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-1 hover:border-slate-300 hover:shadow-xl hover:shadow-slate-900/5"><span className={`flex h-14 w-14 items-center justify-center rounded-2xl ring-1 ${service.softAccent}`}><Icon className="h-7 w-7" /></span><span><span className="block text-2xl font-black tracking-tight">{service.name}</span><span className="mt-2 block max-w-xs text-sm leading-6 text-slate-500">{service.description}</span></span><span className="text-sm font-bold text-slate-700 transition group-hover:translate-x-1">Open workspace <span aria-hidden>→</span></span></button>;
}
