import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import {
  IconCalendar,
  IconCalendarPlus,
  IconClock,
  IconEye,
  IconEyeOff,
} from '../../components/icons';
import { ApiError } from '../../api/types';

function homeFor(role: string): string {
  return role === 'DOCTOR' ? '/doctor/today' : '/staff/today';
}

const highlights = [
  {
    icon: IconCalendar,
    title: "Today's dashboard",
    text: 'Appointments, stats and the whole day at a glance.',
  },
  {
    icon: IconClock,
    title: 'Live queue',
    text: 'Call, skip and recall patients in real time.',
  },
  {
    icon: IconCalendarPlus,
    title: 'Fast booking',
    text: 'Phone bookings and walk-ins in seconds.',
  },
];

function BrandMark({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const cls = size === 'md' ? 'h-10 w-10 rounded-xl' : 'h-9 w-9 rounded-xl';
  return <img src="/logo-icon.png" alt="EasyBook logo" className={cls} />;
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
    return <Navigate to={homeFor(user.role)} replace />;
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
      const u = await loginStaff(identifier.trim(), password);
      navigate(homeFor(u.role), { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Login failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh bg-slate-100">
      {/* ─── Brand panel ─── */}
      <div className="relative hidden w-[44%] max-w-xl flex-col bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-10 text-white lg:flex xl:p-14">
        {/* Decorative glow */}
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-brand-400/10 blur-3xl" aria-hidden />
        <div className="absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-teal-400/10 blur-3xl" aria-hidden />

        <div className="relative flex items-center gap-2.5">
          <BrandMark />
          <div>
            <p className="text-lg font-extrabold leading-tight text-white">EasyBook</p>
            <p className="text-xs text-slate-400">Clinic command center</p>
          </div>
        </div>

        <div className="relative mt-20">
          <h2 className="max-w-sm text-3xl font-extrabold leading-tight text-white">
            Run your entire clinic day from one screen.
          </h2>
          <ul className="mt-10 space-y-6">
            {highlights.map((h) => (
              <li key={h.title} className="flex items-start gap-4">
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-700/60 text-brand-400 ring-1 ring-slate-600/60"
                  aria-hidden
                >
                  <h.icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block font-bold text-slate-200">{h.title}</span>
                  <span className="mt-0.5 block text-sm text-slate-400">{h.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative mt-auto pt-10 text-xs text-slate-500">
          Receptionists, doctors and clinic admins sign in on the right.
        </p>
      </div>

      {/* ─── Sign-in panel ─── */}
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          {/* Mobile brand */}
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <BrandMark size="sm" />
            <div>
              <p className="font-extrabold leading-tight text-slate-900">EasyBook</p>
              <p className="text-[11px] text-slate-500">Clinic command center</p>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white/80 backdrop-blur-sm p-8 shadow-xl shadow-slate-900/5 ring-1 ring-slate-200/80">
            <h1 className="text-2xl font-extrabold text-slate-900">Staff login</h1>
            <p className="mt-1 text-sm text-slate-500">
              Receptionists, doctors and clinic admins sign in here.
            </p>

            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <Input
                label="Email or phone"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="you@yourclinic.com"
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
              <Button type="submit" size="lg" className="w-full btn-lift" loading={submitting}>
                Log in
              </Button>
            </form>
          </div>

          <p className="mt-5 text-center text-sm text-slate-500">
            Are you a patient?{' '}
            <Link to="/login" className="font-semibold text-brand-600 hover:text-brand-700 hover:underline">
              Patient login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}