import { Navigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';

export function ClinicWorkspace() {
  const { user } = useAuth();
  if (user?.role === 'DOCTOR') return <Navigate to="/doctor/today" replace />;
  if (user?.role === 'RECEPTIONIST' || user?.role === 'CLINIC_ADMIN') return <Navigate to="/admin/today" replace />;
  return <Navigate to="/home" replace />;
}
