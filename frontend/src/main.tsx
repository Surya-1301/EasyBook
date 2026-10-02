import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import { AuthProvider } from './auth/AuthContext';
import { ToastProvider } from './components/Toast';

const root = ReactDOM.createRoot(document.getElementById('root')!);

/** Shown instead of a blank page when the app can't boot (e.g. missing env config). */
function SetupError({ message }: { message: string }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
        <p className="text-lg font-extrabold text-slate-900">Setup needed</p>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">{message}</p>
        <p className="mt-4 text-xs leading-relaxed text-slate-400">
          Copy <code className="font-semibold">frontend/.env.example</code> to{' '}
          <code className="font-semibold">frontend/.env</code>, set{' '}
          <code className="font-semibold">VITE_CLINIC_ID</code>, then restart the dev server.
        </p>
      </div>
    </div>
  );
}

// Dynamic import so a module-load failure (e.g. VITE_CLINIC_ID not set in
// utils/clinic.ts) renders a helpful message instead of a blank page.
import('./App')
  .then(({ default: App }) => {
    root.render(
      <React.StrictMode>
        <BrowserRouter>
          <AuthProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </AuthProvider>
        </BrowserRouter>
      </React.StrictMode>,
    );
  })
  .catch((err: unknown) => {
    root.render(
      <React.StrictMode>
        <SetupError message={err instanceof Error ? err.message : 'Failed to start the app.'} />
      </React.StrictMode>,
    );
  });
