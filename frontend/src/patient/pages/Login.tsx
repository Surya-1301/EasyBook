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
      // Focus the first box once the OTP step renders
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
    <div className="min-h-dvh bg-slate-50">
      {/* Warm gradient header — same language as the patient home greeting */}
      <div className="rounded-b-[2rem] bg-gradient-to-br from-brand-600 via-brand-500 to-teal-500 px-6 pb-16 pt-10 text-white">
        <div className="mx-auto w-full max-w-sm">
          <div className="flex items-center gap-3">
            <span
              className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 text-2xl font-bold backdrop-blur"
              aria-hidden
            >
              +
            </span>
            <div>
              <p className="text-lg font-extrabold leading-tight">EasyBook</p>
              <p className="text-xs font-medium text-teal-50/90">Your clinic, one tap away</p>
            </div>
          </div>

          <h1 className="mt-8 text-2xl font-extrabold">
            {step === 'phone' ? 'Welcome' : 'Check your phone'}
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-teal-50/90">
            {step === 'phone' ? (
              'Log in with your mobile number to book visits, track your queue and manage appointments.'
            ) : (
              <>
                We sent a 6-digit code to{' '}
                <span className="font-bold text-white">+91 {normalizePhone(phone)}</span>.{' '}
                <button
                  type="button"
                  onClick={goBackToPhone}
                  className="font-bold text-white underline decoration-white/50 underline-offset-2 hover:decoration-white"
                >
                  Change
                </button>
              </>
            )}
          </p>
        </div>
      </div>

      {/* Overlapping form card */}
      <div className="mx-auto -mt-10 w-full max-w-sm px-4 pb-10">
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          {/* Step indicator */}
          <div className="flex items-center gap-1.5" aria-hidden>
            <span className="h-1.5 flex-1 rounded-full bg-brand-500" />
            <span
              className={`h-1.5 flex-1 rounded-full ${step === 'otp' ? 'bg-brand-500' : 'bg-slate-200'}`}
            />
          </div>

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
            <div className="mt-6">
              <p className="text-center text-sm font-medium text-slate-700">One-time code</p>
              <div
                className="mt-3 grid grid-cols-6 gap-2"
                onPaste={handleOtpPaste}
                role="group"
                aria-label="6-digit one-time code"
              >
                {code.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      otpRefs.current[i] = el;
                    }}
                    value={digit}
                    inputMode="numeric"
                    autoComplete={i === 0 ? 'one-time-code' : 'off'}
                    aria-label={`Digit ${i + 1}`}
                    onChange={(e) => handleOtpChange(i, e.target.value)}
                    onKeyDown={(e) => handleOtpKeyDown(i, e)}
                    className="h-14 w-full rounded-2xl border border-slate-300 bg-white text-center text-xl font-bold text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200"
                  />
                ))}
              </div>
              <Button
                className="mt-5 w-full"
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
                className="mt-3 w-full text-center text-sm font-semibold text-slate-500 hover:text-brand-700 disabled:opacity-50"
              >
                {sending ? 'Sending…' : 'Resend code'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
