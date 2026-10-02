import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { PhoneInput } from '../../components/PhoneInput';
import { ApiError } from '../../api/types';
import { normalizePhone } from '../../utils/format';

export function PatientLogin() {
  const { user, requestOtp, loginWithOtp } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [phone, setPhone] = useState('');
  const [phoneValid, setPhoneValid] = useState(false);
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | undefined>(undefined);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);

  if (user) return <Navigate to="/home" replace />;

  async function sendCode() {
    const normalized = normalizePhone(phone);
    if (!phoneValid || !normalized) {
      toast.error('Enter a valid 10-digit mobile number');
      return;
    }
    setSending(true);
    try {
      const res = await requestOtp(normalized);
      setDevCode(res.devCode);
      setStep('otp');
      toast.success('Code sent. It expires in 5 minutes.');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not send the code. Please try again.');
    } finally {
      setSending(false);
    }
  }

  async function verify() {
    if (code.trim().length !== 6) {
      toast.error('Enter the 6-digit code');
      return;
    }
    setVerifying(true);
    try {
      await loginWithOtp(normalizePhone(phone), code.trim());
      const from = (location.state as { from?: string } | null)?.from || '/home';
      navigate(from, { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Verification failed. Please try again.');
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-extrabold text-slate-900">Welcome</h1>
        <p className="mt-1 text-sm text-slate-500">Log in with your mobile number to book appointments.</p>

        {step === 'phone' ? (
          <div className="mt-6 space-y-4">
            <PhoneInput
              value={phone}
              autoFocus
              onChange={(digits, valid) => {
                setPhone(digits);
                setPhoneValid(valid);
              }}
            />
            <Button className="w-full" size="lg" loading={sending} onClick={sendCode}>
              Send code
            </Button>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-slate-600">
              We sent a 6-digit code to <span className="font-semibold text-slate-900">+91 {normalizePhone(phone)}</span>.
            </p>
            <Input
              label="One-time code"
              value={code}
              autoFocus
              inputMode="numeric"
              maxLength={6}
              placeholder="••••••"
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
            {devCode && (
              <div className="rounded-xl border border-dashed border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Demo code: <span className="font-bold tracking-widest">{devCode}</span>
              </div>
            )}
            <Button className="w-full" size="lg" loading={verifying} onClick={verify}>
              Verify
            </Button>
            <button
              type="button"
              className="w-full text-center text-sm font-semibold text-brand-600 hover:underline"
              onClick={() => {
                setStep('phone');
                setCode('');
                setDevCode(undefined);
              }}
            >
              Use a different number
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
