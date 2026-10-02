import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireRole } from './auth/guards';
import { PatientLayout } from './patient/PatientLayout';
import { StaffLayout } from './staff/StaffLayout';
import { DoctorLayout } from './doctor/DoctorLayout';

// Patient pages
import { PatientLogin } from './patient/pages/Login';
import { Home } from './patient/pages/Home';
import { Doctors } from './patient/pages/Doctors';
import { DoctorDetail } from './patient/pages/DoctorDetail';
import { Booking } from './patient/pages/Booking';
import { Appointments } from './patient/pages/Appointments';
import { AppointmentDetail } from './patient/pages/AppointmentDetail';
import { QueueView } from './patient/pages/QueueView';
import { Profile } from './patient/pages/Profile';

// Staff pages
import { StaffLogin } from './staff/pages/StaffLogin';
import { TodayDashboard } from './staff/pages/TodayDashboard';
import { NewAppointment } from './staff/pages/NewAppointment';
import { NewWalkIn } from './staff/pages/NewWalkIn';
import { Patients } from './staff/pages/Patients';
import { Queue } from './staff/pages/Queue';
import { Settings } from './staff/pages/Settings';
import { DoctorsAdmin } from './staff/pages/DoctorsAdmin';
import { DoctorSchedule } from './staff/pages/DoctorSchedule';
import { Services } from './staff/pages/Services';
import { StaffList } from './staff/pages/StaffList';
import { Reports } from './staff/pages/Reports';

// Doctor pages
import { DoctorToday } from './doctor/pages/DoctorToday';
import { DoctorQueue } from './doctor/pages/DoctorQueue';

import { useAuth } from './auth/AuthContext';
import { LoadingState } from './components/LoadingState';

function RoleHome() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingState />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'DOCTOR') return <Navigate to="/doctor/today" replace />;
  if (user.role === 'RECEPTIONIST' || user.role === 'CLINIC_ADMIN')
    return <Navigate to="/staff/today" replace />;
  return <Navigate to="/home" replace />;
}

export default function App() {
  return (
    <Routes>
      {/* public */}
      <Route path="/login" element={<PatientLogin />} />
      <Route path="/staff/login" element={<StaffLogin />} />

      {/* patient (mobile, bottom tabs) */}
      <Route
        element={
          <RequireRole roles={['PATIENT']}>
            <PatientLayout />
          </RequireRole>
        }
      >
        <Route path="/home" element={<Home />} />
        <Route path="/doctors" element={<Doctors />} />
        <Route path="/doctors/:id" element={<DoctorDetail />} />
        <Route path="/booking/:doctorId" element={<Booking />} />
        <Route path="/appointments" element={<Appointments />} />
        <Route path="/appointments/:id" element={<AppointmentDetail />} />
        <Route path="/queue/:appointmentId" element={<QueueView />} />
        <Route path="/profile" element={<Profile />} />
      </Route>

      {/* reception / admin (desktop sidebar) */}
      <Route
        element={
          <RequireRole roles={['RECEPTIONIST', 'CLINIC_ADMIN']}>
            <StaffLayout />
          </RequireRole>
        }
      >
        <Route path="/staff/today" element={<TodayDashboard />} />
        <Route path="/staff/appointments/new" element={<NewAppointment />} />
        <Route path="/staff/walk-ins/new" element={<NewWalkIn />} />
        <Route path="/staff/patients" element={<Patients />} />
        <Route path="/staff/queue" element={<Queue />} />
        <Route
          path="/staff/settings"
          element={
            <RequireRole roles={['CLINIC_ADMIN']}>
              <Settings />
            </RequireRole>
          }
        />
        <Route
          path="/staff/doctors"
          element={
            <RequireRole roles={['CLINIC_ADMIN']}>
              <DoctorsAdmin />
            </RequireRole>
          }
        />
        <Route
          path="/staff/doctors/:id/schedule"
          element={
            <RequireRole roles={['CLINIC_ADMIN']}>
              <DoctorSchedule />
            </RequireRole>
          }
        />
        <Route
          path="/staff/services"
          element={
            <RequireRole roles={['CLINIC_ADMIN']}>
              <Services />
            </RequireRole>
          }
        />
        <Route
          path="/staff/staff"
          element={
            <RequireRole roles={['CLINIC_ADMIN']}>
              <StaffList />
            </RequireRole>
          }
        />
        <Route
          path="/staff/reports"
          element={
            <RequireRole roles={['CLINIC_ADMIN']}>
              <Reports />
            </RequireRole>
          }
        />
      </Route>

      {/* doctor (tablet-friendly) */}
      <Route
        element={
          <RequireRole roles={['DOCTOR']}>
            <DoctorLayout />
          </RequireRole>
        }
      >
        <Route path="/doctor/today" element={<DoctorToday />} />
        <Route path="/doctor/queue" element={<DoctorQueue />} />
      </Route>

      <Route path="/" element={<RoleHome />} />
      <Route path="*" element={<RoleHome />} />
    </Routes>
  );
}
