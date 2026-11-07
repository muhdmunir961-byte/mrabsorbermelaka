import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { useSession } from './lib/session';
import { ApprovalsPage } from './pages/ApprovalsPage';
import { EmployeeProfilePage } from './pages/EmployeeProfilePage';
import { EmployeesPage } from './pages/EmployeesPage';
import { LeavePage } from './pages/LeavePage';
import { LoginPage } from './pages/LoginPage';
import { OperationsPage } from './pages/OperationsPage';
import { PayrollPage } from './pages/PayrollPage';
import { StaffHomePage } from './pages/StaffHomePage';

export function App() {
  const { user, loading } = useSession();

  if (loading) {
    return (
      <main className="grid min-h-dvh place-items-center bg-canvas">
        <p className="text-sm text-ink-muted" role="status">
          Memuatkan…
        </p>
      </main>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  const isOperations = user.role === 'FOREMAN' || user.role === 'ADMIN_HR' || user.role === 'OWNER';
  const canApprove = user.role === 'ADMIN_HR' || user.role === 'OWNER';

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/home" replace />} />
      <Route element={<AppShell />}>
        <Route
          path="/employees"
          element={canApprove ? <EmployeesPage /> : <Navigate to="/home" replace />}
        />
        <Route path="/employees/:employeeId" element={<EmployeeProfilePage />} />
        <Route path="/home" element={<StaffHomePage />} />
        <Route path="/leave" element={<LeavePage />} />
        <Route
          path="/approvals"
          element={canApprove ? <ApprovalsPage /> : <Navigate to="/home" replace />}
        />
        <Route
          path="/payroll"
          element={canApprove ? <PayrollPage /> : <Navigate to="/home" replace />}
        />
        <Route
          path="/operations"
          element={isOperations ? <OperationsPage /> : <Navigate to="/home" replace />}
        />
      </Route>
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}
