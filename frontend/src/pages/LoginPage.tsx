import { FormEvent, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';

type LoginLocationState = {
  registered?: boolean;
  email?: string;
};

export function LoginPage() {
  const { login, user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [registeredNotice, setRegisteredNotice] = useState(false);

  useEffect(() => {
    const fromQuery = searchParams.get('registered') === '1';
    if (fromQuery) {
      setRegisteredNotice(true);
      const prefill = searchParams.get('email');
      if (prefill) {
        setEmail(prefill);
      }
      setSearchParams({}, { replace: true });
      return;
    }
    const state = location.state as LoginLocationState | null;
    if (state?.registered) {
      setRegisteredNotice(true);
      if (state.email) {
        setEmail(state.email);
      }
      navigate('/login', { replace: true, state: {} });
    }
  }, [location.state, navigate, searchParams, setSearchParams]);

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
        {registeredNotice ? (
          <div className="callout callout-success" role="status">
            Регистрация прошла успешно. Войдите, используя email и пароль.
          </div>
        ) : null}
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
