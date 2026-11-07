import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { useSession } from './lib/session';
import { LoginPage } from './pages/LoginPage';
import { OperationsPage } from './pages/OperationsPage';
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

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/home" replace />} />
      <Route element={<AppShell />}>
        <Route path="/home" element={<StaffHomePage />} />
        <Route
          path="/operations"
          element={isOperations ? <OperationsPage /> : <Navigate to="/home" replace />}
        />
      </Route>
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}
