import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../../../api/client';
import type { ServiceType } from '../../../../api/types';
import { ApiError } from '../../../../api/types';
import { Button } from '../../../../components/Button';
import { Input } from '../../../../components/Input';

const services: Array<{ id: ServiceType; label: string }> = [
  { id: 'clinic', label: 'Clinic' },
  { id: 'barber', label: 'Barber shop' },
];

export function AdminCreateAccount() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [serviceType, setServiceType] = useState<ServiceType>('clinic');
  const [saving, setSaving] = useState(false);
  const [workspaceId, setWorkspaceId] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      const result = await api.auth.registerAdmin({ name, businessName, email, password, serviceType });
      setWorkspaceId(result.account.workspaceId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the admin account.');
    } finally {
      setSaving(false);
    }
  }

  if (workspaceId) {
    return <div className="flex min-h-dvh items-center justify-center bg-[#f4f6f5] px-5"><div className="w-full max-w-md rounded-[2rem] bg-white p-8 text-center shadow-xl shadow-slate-900/10"><p className="text-sm font-bold text-teal-700">Workspace created</p><h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">Your EasyBook ID</h1><p className="mt-3 text-sm leading-6 text-slate-500">Use your email and password to sign in. Keep this workspace ID for your records.</p><p className="mt-5 rounded-xl bg-slate-100 px-4 py-3 font-mono text-lg font-bold text-slate-900">{workspaceId}</p><Button className="mt-6 w-full" onClick={() => navigate('/admin')}>Go to admin login</Button></div></div>;
  }

  return <div className="flex min-h-dvh items-center justify-center bg-[#f4f6f5] px-5 py-10"><div className="w-full max-w-lg rounded-[2rem] border border-slate-200 bg-white p-8 shadow-xl shadow-slate-900/10 sm:p-10"><p className="text-sm font-bold text-teal-700">EasyBook admin</p><h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">Create your workspace</h1><p className="mt-2 text-sm leading-6 text-slate-500">Choose one service. Your next login will open it directly.</p><form onSubmit={submit} className="mt-6 space-y-4"><Input label="Your name" value={name} onChange={(e) => setName(e.target.value)} required /><Input label="Business name" value={businessName} onChange={(e) => setBusinessName(e.target.value)} required /><label className="block text-sm font-semibold text-slate-700">Service<select value={serviceType} onChange={(e) => setServiceType(e.target.value as ServiceType)} className="input-field mt-2 block min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 font-normal text-slate-900">{services.map((service) => <option key={service.id} value={service.id}>{service.label}</option>)}</select></label><Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /><Input label="Password" type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" error={error || undefined} /><Button type="submit" className="mt-2 w-full" loading={saving}>Create account</Button></form><p className="mt-5 text-center text-sm text-slate-500"><Link to="/admin" className="font-semibold text-teal-700 hover:underline">Back to admin login</Link></p></div></div>;
}
