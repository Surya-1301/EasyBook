import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { Role } from '../api/types';
import { LoadingState } from '../components/LoadingState';

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingState message="Loading…" />;

  if (!user) {
    const loginPath =
      location.pathname.startsWith('/staff') || location.pathname.startsWith('/doctor') || location.pathname.startsWith('/admin')
        ? '/admin'
        : '/login';
    return <Navigate to={loginPath} replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}

export function RequireRole({
  roles,
  children,
}: {
  roles: Role[];
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();

  if (loading) return <LoadingState message="Loading…" />;
  if (!user) return <Navigate to={roles.includes('PATIENT') ? '/login' : '/admin'} replace />;
  if (!roles.includes(user.role)) {
    // Send each role to its own home
    const home =
      user.role === 'PATIENT'
        ? '/home'
        : user.role === 'DOCTOR'
          ? '/doctor/today'
          : '/admin/today';
    return <Navigate to={home} replace />;
  }
  return <>{children}</>;
}
