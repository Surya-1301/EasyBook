import { useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { Button } from '../../components/Button';
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
  const [code, setCode] = useState<string[]>(['', '', '', '', '', '']);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);

  if (user) return <Navigate to="/home" replace />;

  const otpValue = code.join('');

  async function sendCode() {
    const normalized = normalizePhone(phone);
    if (!phoneValid || !normalized) {
      toast.error('Enter a valid 10-digit mobile number');
      return;
    }
    setSending(true);
    try {
      await requestOtp(normalized);
      setCode(['', '', '', '', '', '']);
      setStep('otp');
      toast.success('Code sent. It expires in 5 minutes.');
      setTimeout(() => otpRefs.current[0]?.focus(), 50);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not send the code. Please try again.');
    } finally {
      setSending(false);
    }
  }

  async function verify() {
    if (otpValue.length !== 6) {
      toast.error('Enter the 6-digit code');
      return;
    }
    setVerifying(true);
    try {
      await loginWithOtp(normalizePhone(phone), otpValue);
      const from = (location.state as { from?: string } | null)?.from || '/home';
      navigate(from, { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Verification failed. Please try again.');
    } finally {
      setVerifying(false);
    }
  }

  function handleOtpChange(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1);
    setCode((prev) => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
    if (digit && index < 5) otpRefs.current[index + 1]?.focus();
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
    if (e.key === 'Enter') verify();
  }

  function handleOtpPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!digits) return;
    e.preventDefault();
    setCode(digits.padEnd(6, '').split(''));
    otpRefs.current[Math.min(digits.length, 5)]?.focus();
  }

  function goBackToPhone() {
    setStep('phone');
    setCode(['', '', '', '', '', '']);
  }

  return (
    <div className="min-h-dvh bg-mesh flex flex-col">
      {/* ─── Top bar ─── */}
      <header className="px-5 py-4 flex items-center gap-3">
        <img src="/logo-icon.png" alt="EasyBook logo" className="h-10 w-10 rounded-xl bg-white shadow-md ring-1 ring-teal-100" />
        <span className="text-xl font-extrabold tracking-tight text-slate-900">EasyBook</span>
      </header>

      {/* ─── Hero section ─── */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 pt-8 pb-4">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            Welcome back
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-500">
            Log in with your mobile number to book visits, track your queue, and manage appointments.
          </p>
        </div>

        {/* ─── Form card ─── */}
        <div className="w-full max-w-sm pt-6">
          <div className="rounded-3xl bg-white/80 backdrop-blur-md border border-white/60 px-7 py-8 shadow-xl shadow-teal-900/5 ring-1 ring-slate-200/60">
            {/* Step indicator */}
            <div className="flex items-center gap-1.5" aria-hidden>
              <span className={`h-1.5 flex-1 rounded-full transition-colors ${step === 'phone' ? 'bg-brand-500' : 'bg-brand-500/30'}`} />
              <span className={`h-1.5 flex-1 rounded-full transition-colors ${step === 'otp' ? 'bg-brand-500' : 'bg-brand-500/30'}`} />
            </div>

            {step === 'phone' ? (
              <div className="mt-7 space-y-5">
                <PhoneInput
                  value={phone}
                  autoFocus
                  onChange={(digits, valid) => {
                    setPhone(digits);
                    setPhoneValid(valid);
                  }}
                />
                <Button className="w-full btn-lift" size="lg" loading={sending} onClick={sendCode}>
                  Send code
                </Button>
              </div>
            ) : (
              <div className="mt-7">
                <p className="text-center text-sm font-semibold text-slate-700">One-time code</p>
                <p className="mt-1 text-center text-xs text-slate-400">
                  Sent to +91 {normalizePhone(phone)}
                </p>
                <div
                  className="mt-4 grid grid-cols-6 gap-2"
                  onPaste={handleOtpPaste}
                  role="group"
                  aria-label="6-digit one-time code"
                >
                  {code.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => { otpRefs.current[i] = el; }}
                      value={digit}
                      inputMode="numeric"
                      autoComplete={i === 0 ? 'one-time-code' : 'off'}
                      aria-label={`Digit ${i + 1}`}
                      onChange={(e) => handleOtpChange(i, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(i, e)}
                      className="otp-input h-14 w-full rounded-2xl border border-slate-300 bg-white text-center text-xl font-bold text-slate-900 focus:border-brand-500 focus:outline-none"
                    />
                  ))}
                </div>
                <Button
                  className="mt-5 w-full btn-lift"
                  size="lg"
                  loading={verifying}
                  disabled={otpValue.length !== 6}
                  onClick={verify}
                >
                  Verify &amp; continue
                </Button>
                <button
                  type="button"
                  disabled={sending}
                  onClick={sendCode}
                  className="mt-3 block w-full text-center text-sm font-semibold text-brand-600 hover:text-brand-700 disabled:opacity-50"
                >
                  {sending ? 'Sending…' : 'Resend code'}
                </button>
              </div>
            )}
          </div>

          {/* Back link */}
          {step === 'otp' && (
            <button
              type="button"
              onClick={goBackToPhone}
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              ← Back
            </button>
          )}
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="px-6 py-5 text-center">
        <p className="text-xs text-slate-400">
          Need help? Contact your clinic.
        </p>
      </footer>
    </div>
  );
}