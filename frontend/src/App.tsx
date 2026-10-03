import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireRole } from './auth/guards';
import { PatientLayout } from './services/clinic/patient/PatientLayout';
import { StaffLayout } from './services/clinic/staff/StaffLayout';
import { DoctorLayout } from './services/clinic/doctor/DoctorLayout';

// Patient pages
import { PatientLogin } from './services/clinic/patient/pages/Login';
import { Home } from './services/clinic/patient/pages/Home';
import { Doctors } from './services/clinic/patient/pages/Doctors';
import { DoctorDetail } from './services/clinic/patient/pages/DoctorDetail';
import { Booking } from './services/clinic/patient/pages/Booking';
import { Appointments } from './services/clinic/patient/pages/Appointments';
import { AppointmentDetail } from './services/clinic/patient/pages/AppointmentDetail';
import { QueueView } from './services/clinic/patient/pages/QueueView';
import { Profile } from './services/clinic/patient/pages/Profile';

// Staff pages
import { StaffLogin } from './services/clinic/staff/pages/StaffLogin';
import { AdminCreateAccount } from './services/clinic/staff/pages/AdminCreateAccount';
import { TodayDashboard } from './services/clinic/staff/pages/TodayDashboard';
import { NewAppointment } from './services/clinic/staff/pages/NewAppointment';
import { NewWalkIn } from './services/clinic/staff/pages/NewWalkIn';
import { Patients } from './services/clinic/staff/pages/Patients';
import { Queue } from './services/clinic/staff/pages/Queue';
import { Settings } from './services/clinic/staff/pages/Settings';
import { DoctorsAdmin } from './services/clinic/staff/pages/DoctorsAdmin';
import { DoctorSchedule } from './services/clinic/staff/pages/DoctorSchedule';
import { Services } from './services/clinic/staff/pages/Services';
import { StaffList } from './services/clinic/staff/pages/StaffList';
import { Reports } from './services/clinic/staff/pages/Reports';

// Doctor pages
import { DoctorToday } from './services/clinic/doctor/pages/DoctorToday';
import { DoctorQueue } from './services/clinic/doctor/pages/DoctorQueue';

import { useAuth } from './auth/AuthContext';
import { LoadingState } from './components/LoadingState';
import { ServiceSelection } from './services/ServiceSelection';
import { ClinicWorkspace } from './services/clinic/ClinicWorkspace';
import { BarberDashboard } from './services/barber/BarberDashboard';

function RoleHome() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingState />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to="/services" replace />;
}

export default function App() {
  return (
    <Routes>
      {/* public */}
      <Route path="/login" element={<PatientLogin />} />
      <Route path="/admin" element={<StaffLogin />} />
      <Route path="/admin/create" element={<AdminCreateAccount />} />
      <Route path="/staff/login" element={<Navigate to="/admin" replace />} />

      <Route
        path="/services"
        element={
          <RequireRole roles={['PATIENT', 'RECEPTIONIST', 'CLINIC_ADMIN', 'DOCTOR']}>
            <ServiceSelection />
          </RequireRole>
        }
      />
      <Route
        path="/workspace/barber"
        element={
          <RequireRole roles={['PATIENT', 'RECEPTIONIST', 'CLINIC_ADMIN', 'DOCTOR']}>
            <BarberDashboard />
          </RequireRole>
        }
      />
      <Route
        path="/workspace/clinic"
        element={
          <RequireRole roles={['PATIENT', 'RECEPTIONIST', 'CLINIC_ADMIN', 'DOCTOR']}>
            <ClinicWorkspace />
          </RequireRole>
        }
      />

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
        <Route path="/clinics/:clinicId/doctors" element={<Doctors />} />
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
        <Route path="/admin/today" element={<TodayDashboard />} />
        <Route path="/admin/appointments/new" element={<NewAppointment />} />
        <Route path="/admin/walk-ins/new" element={<NewWalkIn />} />
        <Route path="/admin/patients" element={<Patients />} />
        <Route path="/admin/queue" element={<Queue />} />
        <Route
          path="/admin/settings"
          element={
            <RequireRole roles={['CLINIC_ADMIN']}>
              <Settings />
            </RequireRole>
          }
        />
        <Route
          path="/admin/doctors"
          element={
            <RequireRole roles={['CLINIC_ADMIN']}>
              <DoctorsAdmin />
            </RequireRole>
          }
        />
        <Route
          path="/admin/doctors/:id/schedule"
          element={
            <RequireRole roles={['CLINIC_ADMIN']}>
              <DoctorSchedule />
            </RequireRole>
          }
        />
        <Route
          path="/admin/services"
          element={
            <RequireRole roles={['CLINIC_ADMIN']}>
              <Services />
            </RequireRole>
          }
        />
        <Route
          path="/admin/staff"
          element={
            <RequireRole roles={['CLINIC_ADMIN']}>
              <StaffList />
            </RequireRole>
          }
        />
        <Route
          path="/admin/reports"
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

        <Route path="/staff/today" element={<Navigate to="/admin/today" replace />} />
        <Route path="/staff/appointments/new" element={<Navigate to="/admin/appointments/new" replace />} />
        <Route path="/staff/walk-ins/new" element={<Navigate to="/admin/walk-ins/new" replace />} />
        <Route path="/staff/patients" element={<Navigate to="/admin/patients" replace />} />
        <Route path="/staff/queue" element={<Navigate to="/admin/queue" replace />} />
        <Route path="/staff/settings" element={<Navigate to="/admin/settings" replace />} />
        <Route path="/staff/doctors" element={<Navigate to="/admin/doctors" replace />} />
        <Route path="/staff/doctors/:id/schedule" element={<Navigate to="/admin/doctors/:id/schedule" replace />} />
        <Route path="/staff/services" element={<Navigate to="/admin/services" replace />} />
        <Route path="/staff/staff" element={<Navigate to="/admin/staff" replace />} />
        <Route path="/staff/reports" element={<Navigate to="/admin/reports" replace />} />

      <Route path="/" element={<RoleHome />} />
      <Route path="*" element={<RoleHome />} />
    </Routes>
  );
}
