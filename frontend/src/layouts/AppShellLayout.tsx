import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';

export function AppShellLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="shell">
      <header className="shell-header">
        <Link className="shell-brand" to="/app">
          KitYourBrand
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span className="shell-user">{user?.name ?? user?.email}</span>
          <button type="button" className="btn btn-ghost" onClick={() => void logout()}>
            Выйти
          </button>
        </div>
      </header>
      <main className="shell-main">
        <Outlet />
      </main>
    </div>
  );
}
