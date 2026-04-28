import { FormEvent, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';

export function RegisterPage() {
  const { register, user, loading } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
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
      await register(name, email, password, passwordConfirm);
      navigate('/login', {
        replace: true,
        state: { registered: true, email: email.trim() },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка регистрации.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="page">
      <div className="card" style={{ maxWidth: 480 }}>
        <h2 style={{ marginTop: 0 }}>Регистрация</h2>
        {error ? <div className="error">{error}</div> : null}
        <form onSubmit={(e) => void onSubmit(e)}>
          <div className="form-field">
            <label htmlFor="name">Имя</label>
            <input
              id="name"
              name="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              minLength={2}
              required
            />
          </div>
          <div className="form-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
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
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <div className="form-field">
            <label htmlFor="password_confirm">Повтор пароля</label>
            <input
              id="password_confirm"
              name="password_confirm"
              type="password"
              autoComplete="new-password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <div className="btn-row">
            <button className="btn btn-primary" type="submit" disabled={pending}>
              {pending ? 'Регистрация…' : 'Создать аккаунт'}
            </button>
            <Link className="btn btn-ghost" to="/login">
              Уже есть аккаунт
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
