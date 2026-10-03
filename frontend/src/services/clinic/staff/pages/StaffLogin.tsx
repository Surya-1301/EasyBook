import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../../auth/AuthContext';
import { useToast } from '../../../../components/Toast';
import { Button } from '../../../../components/Button';
import { Input } from '../../../../components/Input';
import {
  IconCalendar,
  IconClock,
  IconEye,
  IconEyeOff,
  IconScissors,
  IconShoppingBag,
  IconStethoscope,
} from '../../../../components/icons';
import { ApiError } from '../../../../api/types';

const highlights = [
  {
    icon: IconCalendar,
    title: 'See the day clearly',
    text: 'Appointments, orders, queues and sales in one calm view.',
  },
  {
    icon: IconClock,
    title: 'Keep work moving',
    text: 'Give every customer, chair and order a clear next step.',
  },
  {
    icon: IconShoppingBag,
    title: 'Switch with ease',
    text: 'Move between your local business workspaces whenever you need.',
  },
];

const workspaces = [
  { icon: IconStethoscope, label: 'Clinic', color: 'text-teal-300' },
  { icon: IconScissors, label: 'Barber shop', color: 'text-amber-300' },
  { icon: IconShoppingBag, label: 'Kirana store', color: 'text-sky-300' },
];

function BrandMark({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const cls = size === 'md' ? 'h-10 w-10 rounded-xl' : 'h-9 w-9 rounded-xl';
  return <img src="/logo-icon.png" alt="EasyBook logo" className={cls} />;
}

function workspacePath(serviceType?: string | null): string {
  if (serviceType === 'clinic') return '/workspace/clinic';
  if (serviceType === 'barber') return '/workspace/barber';
  return '/services';
}

export function StaffLogin() {
  const { user, loginStaff } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  if (user && user.role !== 'PATIENT') {
    return <Navigate to={workspacePath(user.serviceType)} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!identifier.trim() || !password) {
      setFormError('Enter your email (or phone) and password.');
      return;
    }
    setFormError('');
    setSubmitting(true);
    try {
      const loggedInUser = await loginStaff(identifier.trim(), password);
      navigate(workspacePath(loggedInUser.serviceType), { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Login failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh bg-[#f4f6f5]">
      {/* ─── Brand panel ─── */}
      <div className="relative hidden w-[46%] max-w-2xl flex-col overflow-hidden bg-[#10232c] p-10 text-white lg:flex xl:p-14">
        <div className="absolute -right-24 top-1/4 h-72 w-72 rounded-full border-[48px] border-amber-300/10" aria-hidden />
        <div className="absolute -bottom-28 -left-24 h-72 w-72 rounded-full bg-teal-400/10 blur-3xl" aria-hidden />

        <div className="relative flex items-center gap-2.5">
          <BrandMark />
          <div>
            <p className="text-lg font-extrabold leading-tight text-white">EasyBook</p>
            <p className="text-xs text-slate-400">Book Local, Skip the Wait</p>
          </div>
        </div>

        <div className="relative mt-24">
          <p className="max-w-sm text-sm font-bold text-amber-300">The back office for everyday businesses</p>
          <h2 className="mt-4 max-w-lg text-4xl font-black leading-[1.05] tracking-tight text-white xl:text-5xl">
            Make the busy parts feel simple.
          </h2>
          <p className="mt-5 max-w-md text-base leading-7 text-slate-300">
            One workspace for the local services your customers rely on every day.
          </p>
          <div className="mt-8 flex flex-wrap gap-2">
            {workspaces.map((workspace) => (
              <span key={workspace.label} className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-sm font-semibold text-slate-200 ring-1 ring-white/10">
                <workspace.icon className={`h-4 w-4 ${workspace.color}`} />
                {workspace.label}
              </span>
            ))}
          </div>
          <ul className="mt-12 space-y-5">
            {highlights.map((h) => (
              <li key={h.title} className="flex items-start gap-4">
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-teal-300 ring-1 ring-white/10"
                  aria-hidden
                >
                  <h.icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block font-bold text-slate-100">{h.title}</span>
                  <span className="mt-0.5 block text-sm text-slate-400">{h.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative mt-auto pt-10 text-xs text-slate-500">
          Built for teams that keep their neighbourhood moving.
        </p>
      </div>

      {/* ─── Sign-in panel ─── */}
      <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[430px]">
          {/* Mobile brand */}
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <BrandMark size="sm" />
            <div>
              <p className="font-extrabold leading-tight text-slate-900">EasyBook</p>
              <p className="text-[11px] text-slate-500">Local business workspace</p>
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-[0_24px_70px_rgba(16,35,44,0.10)] sm:p-10">
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">Welcome back.</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">Sign in to choose the business you want to run today.</p>

            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <Input
                label="Email or phone"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="you@yourbusiness.com"
                autoComplete="username"
                error={formError || undefined}
              />
              <div className="relative">
                <Input
                  label="Password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="[&>input]:pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute bottom-0 right-1 flex h-[44px] w-10 items-center justify-center rounded-lg text-slate-400 transition hover:text-slate-600"
                >
                  {showPassword ? (
                    <IconEyeOff className="h-5 w-5" />
                  ) : (
                    <IconEye className="h-5 w-5" />
                  )}
                </button>
              </div>
              <Button type="submit" size="lg" className="mt-2 w-full btn-lift bg-[#10232c] hover:bg-[#1d3a46] focus:ring-[#10232c]" loading={submitting}>
                Login
              </Button>
            </form>
            <Link to="/admin/create" className="mt-4 block text-center text-sm font-semibold text-teal-700 hover:underline">
              Create admin account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}