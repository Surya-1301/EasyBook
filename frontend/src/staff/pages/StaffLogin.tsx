import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { ApiError } from '../../api/types';

function homeFor(role: string): string {
  return role === 'DOCTOR' ? '/doctor/today' : '/staff/today';
}

export function StaffLogin() {
  const { user, loginStaff } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
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
    <div className="mx-auto flex min-h-[70dvh] w-full max-w-md flex-col justify-center px-4 py-10">
      <h1 className="text-2xl font-bold text-slate-900">Staff login</h1>
      <p className="mt-1 text-sm text-slate-500">Receptionists, doctors and clinic admins sign in here.</p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <Input
          label="Email or phone"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder="reception@demo.clinic"
          autoComplete="username"
          error={formError || undefined}
        />
        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        <Button type="submit" size="lg" className="w-full" loading={submitting}>
          Log in
        </Button>
      </form>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-semibold text-slate-700">Demo accounts</p>
        <dl className="mt-2 space-y-1 text-sm text-slate-600">
          <div className="flex justify-between gap-2">
            <dt className="font-medium">Receptionist</dt>
            <dd className="font-mono text-xs">reception@demo.clinic / reception123</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="font-medium">Clinic admin</dt>
            <dd className="font-mono text-xs">admin@demo.clinic / admin123</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
