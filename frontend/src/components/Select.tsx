import { SelectHTMLAttributes } from 'react';

export type SelectOption = { value: string; label: string };

type Props = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  options: SelectOption[];
  error?: string;
  placeholder?: string;
};

export function Select({ label, options, error, placeholder = 'Select…', id, className = '', ...rest }: Props) {
  const fieldId = id || `select-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <div className={className}>
      <label htmlFor={fieldId} className="mb-1 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <select
        id={fieldId}
        className={`min-h-[44px] w-full rounded-xl border bg-white px-4 text-base text-slate-900 focus:outline-none focus:ring-2 ${
          error ? 'border-red-400 focus:ring-red-200' : 'border-slate-300 focus:border-brand-500 focus:ring-brand-200'
        }`}
        {...rest}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && (
        <p className="mt-1 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
