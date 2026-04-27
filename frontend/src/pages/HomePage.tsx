import { Link } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';

export function HomePage() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="page-center muted">Загрузка…</div>;
  }

  return (
    <div className="page">
      <h1>KitYourBrand (React)</h1>
      <p className="muted">
        Каркас SPA. Классический интерфейс на Jinja по-прежнему доступен на том же backend.
      </p>
      {user ? (
        <p>
          Вы вошли как <strong>{user.email}</strong>.{' '}
          <Link to="/app">Личный кабинет</Link>
        </p>
      ) : (
        <p className="btn-row">
          <Link className="btn btn-primary" to="/login">
            Вход
          </Link>
          <Link className="btn btn-ghost" to="/register">
            Регистрация
          </Link>
        </p>
      )}
    </div>
  );
}
