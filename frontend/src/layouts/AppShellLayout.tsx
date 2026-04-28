import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';

function navLinkClassName({ isActive }: { isActive: boolean }): string {
  return ['shell-nav-link', isActive ? 'shell-nav-link--active' : ''].filter(Boolean).join(' ');
}

export function AppShellLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="shell">
      <header className="shell-header">
        <div className="shell-header-left">
          <Link className="shell-brand" to="/app">
            KitYourBrand
          </Link>
          <nav className="shell-nav" aria-label="Разделы кабинета">
            <NavLink to="/app/projects" className={navLinkClassName}>
              Проекты
            </NavLink>
            <NavLink to="/app/history" className={navLinkClassName}>
              История
            </NavLink>
            <NavLink to="/app/profile" className={navLinkClassName}>
              Профиль
            </NavLink>
          </nav>
        </div>
        <div className="shell-header-right">
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
