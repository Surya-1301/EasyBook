import { useState } from 'react';
import { Input } from './Input';
import { isValidIndianPhone } from '../utils/format';

type Props = {
  label?: string;
  value: string;
  onChange: (digits: string, valid: boolean) => void;
  error?: string;
  autoFocus?: boolean;
};

export function PhoneInput({ label = 'Mobile number', value, onChange, error, autoFocus }: Props) {
  const [touched, setTouched] = useState(false);
  const showError = touched && !isValidIndianPhone(value);

  return (
    <div>
      <div className="flex gap-2">
        <span className="flex min-h-[44px] items-center rounded-xl border border-slate-300 bg-slate-50 px-3 text-base font-medium text-slate-600">
          +91
        </span>
        <div className="flex-1">
          <Input
            label={label}
            value={value}
            autoFocus={autoFocus}
            inputMode="numeric"
            maxLength={10}
            placeholder="98765 43210"
            error={error || (showError ? 'Enter a valid 10-digit mobile number' : undefined)}
            onChange={(e) => {
              const d = e.target.value.replace(/\D/g, '').slice(0, 10);
              onChange(d, isValidIndianPhone(d));
            }}
            onBlur={() => setTouched(true)}
            aria-label="10-digit mobile number"
          />
        </div>
      </div>
      <p className="mt-1 text-xs text-slate-500">We&apos;ll send a one-time code to this number.</p>
    </div>
  );
}
