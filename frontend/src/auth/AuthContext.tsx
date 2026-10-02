import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from '../api/client';
import { User } from '../api/types';

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  requestOtp: (phone: string) => Promise<{ devCode?: string }>;
  loginWithOtp: (phone: string, code: string) => Promise<User>;
  loginStaff: (identifier: string, password: string) => Promise<User>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    api.auth.logout().catch(() => undefined);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      const onStaff = window.location.pathname.startsWith('/staff') || window.location.pathname.startsWith('/doctor');
      window.location.href = onStaff ? '/staff/login' : '/login';
    });
    if (getToken()) {
      api.auth
        .me()
        .then((res) => setUser(res.user))
        .catch(() => setToken(null))
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
    return () => setUnauthorizedHandler(null);
  }, []);

  const requestOtp = useCallback(async (phone: string) => {
    const res = await api.auth.requestOtp(phone);
    return { devCode: res.devCode };
  }, []);

  const loginWithOtp = useCallback(async (phone: string, code: string) => {
    const res = await api.auth.verifyOtp(phone, code);
    setToken(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const loginStaff = useCallback(async (identifier: string, password: string) => {
    const res = await api.auth.staffLogin(identifier, password);
    setToken(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const value = useMemo(
    () => ({ user, loading, requestOtp, loginWithOtp, loginStaff, logout }),
    [user, loading, requestOtp, loginWithOtp, loginStaff, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
