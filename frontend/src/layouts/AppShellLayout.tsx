import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import {
  legacyDashboardUrl,
  legacyGenerationHistoryUrl,
  legacyProfileUrl,
} from '@/config/legacyApp';

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
            <NavLink to="/app" end className={navLinkClassName}>
              Проекты
            </NavLink>
            <a
              className="shell-nav-link shell-nav-link--legacy"
              href={legacyDashboardUrl()}
              title="Классический интерфейс (Jinja)"
            >
              Дашборд
            </a>
            <a
              className="shell-nav-link shell-nav-link--legacy"
              href={legacyGenerationHistoryUrl()}
              title="Классический интерфейс (Jinja)"
            >
              История
            </a>
            <a
              className="shell-nav-link shell-nav-link--legacy"
              href={legacyProfileUrl()}
              title="Классический интерфейс (Jinja)"
            >
              Профиль
            </a>
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
