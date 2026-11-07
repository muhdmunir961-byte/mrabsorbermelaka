import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useSession } from '../lib/session';

const roleLabel: Record<string, string> = {
  STAFF: 'Mekanik',
  FOREMAN: 'Foreman',
  ADMIN_HR: 'Admin / HR',
  OWNER: 'Pemilik',
};

export function AppShell() {
  const { user, signOut } = useSession();
  const navigate = useNavigate();
  if (!user) return null;

  const canSeeOperations =
    user.role === 'FOREMAN' || user.role === 'ADMIN_HR' || user.role === 'OWNER';

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    [
      'rounded-control px-3 py-2 text-sm font-medium transition-colors',
      isActive ? 'bg-accent-soft text-accent-strong' : 'text-ink-muted hover:text-ink',
    ].join(' ');

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
          <p className="text-lg font-black tracking-tight">
            <span className="text-accent">MR.</span> ABSORBER
          </p>

          <nav className="flex items-center gap-1" aria-label="Navigasi utama">
            <NavLink to="/home" className={linkClass}>
              Utama
            </NavLink>
            {canSeeOperations ? (
              <NavLink to="/operations" className={linkClass}>
                Operasi Cawangan
              </NavLink>
            ) : null}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-semibold leading-tight">{user.fullName}</p>
              <p className="text-xs text-ink-muted">{roleLabel[user.role] ?? user.role}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                void signOut().then(() => navigate('/login'));
              }}
              className="rounded-control border border-border px-3 py-2 text-sm font-medium text-ink hover:bg-canvas"
            >
              Log keluar
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
