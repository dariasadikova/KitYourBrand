import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';

export function LoginPage() {
  const { login, user, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!loading && user) {
    return <Navigate to="/app" replace />;
  }

  if (loading) {
    return <div className="page-center muted">Загрузка…</div>;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      await login(email, password);
      navigate('/app', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка входа.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="page">
      <div className="card" style={{ maxWidth: 420 }}>
        <h2 style={{ marginTop: 0 }}>Вход</h2>
        {error ? <div className="error">{error}</div> : null}
        <form onSubmit={(e) => void onSubmit(e)}>
          <div className="form-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="form-field">
            <label htmlFor="password">Пароль</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="btn-row">
            <button className="btn btn-primary" type="submit" disabled={pending}>
              {pending ? 'Вход…' : 'Войти'}
            </button>
            <Link className="btn btn-ghost" to="/register">
              Регистрация
            </Link>
          </div>
        </form>
        <p className="muted" style={{ marginBottom: 0, marginTop: '1.25rem', fontSize: '0.875rem' }}>
          <Link to="/">На главную</Link>
        </p>
      </div>
    </div>
  );
}
