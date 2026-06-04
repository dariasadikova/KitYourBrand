import { type FormEvent, useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { setPendingHelpGuide } from '../config/helpGuide'
import { login, register, requestPasswordReset, resetPasswordWithToken, validatePasswordResetToken } from '../services/authApi'
import type { AuthMeResponse, LoginResponse } from '../types/auth'
import { AuthModalBrand, AuthScreenShell } from '../components/layout/AppLayout'
import { EmailIcon, LockIcon, QuestionIcon, UserIcon } from '../components/icons'

export function LoginPage({
  session,
  onSessionChange,
}: {
  session: AuthMeResponse | null
  onSessionChange: (session: LoginResponse) => void
}) {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const queryError = searchParams.get('error') || ''

  if (session?.authenticated) return <Navigate to="/dashboard" replace />

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      const nextSession = await login({ email, password })
      const welcomeAfterRegister = searchParams.get('registered') === '1'
      const userId = nextSession.user?.id
      if (welcomeAfterRegister && userId != null) {
        setPendingHelpGuide(userId)
      }
      onSessionChange(nextSession)
      if (nextSession.claimed_demo_project?.editor_url) {
        navigate(nextSession.claimed_demo_project.editor_url.replace(/^\/app/, ''), { replace: true })
        return
      }
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось войти.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthScreenShell>
      <div className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="login-title">
        <Link className="auth-modal-close" to="/" aria-label="Закрыть">×</Link>
        <AuthModalBrand />
        <h1 className="auth-modal-title" id="login-title">Вход</h1>
        {searchParams.get('registered') === '1' ? (
          <div className="callout callout-success" role="status">Регистрация прошла успешно. Войдите, используя email и пароль.</div>
        ) : null}
        {searchParams.get('reset') === '1' ? (
          <div className="callout callout-success" role="status">Пароль обновлён. Войдите с новым паролем.</div>
        ) : null}
        {error || queryError ? <div className="error">{error || queryError}</div> : null}
        <form className="auth-modal-form" onSubmit={handleSubmit}>
          <label className="auth-input-wrap" htmlFor="email">
            <span className="auth-input-icon" aria-hidden="true">
              <EmailIcon />
            </span>
            <input id="email" type="email" name="email" placeholder="Почта" value={email} autoComplete="email" required onChange={(event) => setEmail(event.target.value)} />
          </label>
          <div className="auth-input-wrap">
            <span className="auth-input-icon" aria-hidden="true">
              <LockIcon />
            </span>
            <input id="password" type="password" name="password" placeholder="Пароль" value={password} autoComplete="current-password" required onChange={(event) => setPassword(event.target.value)} />
            <Link
              to="/forgot-password"
              className="auth-password-help"
              aria-label="Забыли пароль?"
              onClick={(event) => event.stopPropagation()}
            >
              <span className="auth-password-help__icon" aria-hidden="true">
                <QuestionIcon />
              </span>
              <span className="auth-password-help__tooltip" role="tooltip">
                Забыли пароль?
              </span>
            </Link>
          </div>
          <button type="submit" className="btn auth-submit-btn" disabled={isSubmitting}>
            {isSubmitting ? 'Вход...' : 'Войти'}
          </button>
        </form>
        <p className="auth-switch">Нет аккаунта? <Link to="/register">Зарегистрироваться</Link></p>
      </div>
    </AuthScreenShell>
  )
}

export function RegisterPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const queryError = searchParams.get('error') || ''

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      await register({
        name,
        email,
        password,
        password_confirm: passwordConfirm,
      })
      navigate('/login?registered=1', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось зарегистрироваться.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthScreenShell>
      <div className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="register-title">
        <Link className="auth-modal-close" to="/" aria-label="Закрыть">×</Link>
        <AuthModalBrand />
        <h1 className="auth-modal-title" id="register-title">Регистрация</h1>

        {error || queryError ? <div className="error">{error || queryError}</div> : null}

        <form className="auth-modal-form" onSubmit={handleSubmit}>
          <label className="auth-input-wrap" htmlFor="name">
            <span className="auth-input-icon" aria-hidden="true">
              <UserIcon />
            </span>
            <input id="name" type="text" name="name" placeholder="Имя" value={name} autoComplete="name" minLength={2} required onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="auth-input-wrap" htmlFor="register-email">
            <span className="auth-input-icon" aria-hidden="true">
              <EmailIcon />
            </span>
            <input id="register-email" type="email" name="email" placeholder="Почта" value={email} autoComplete="email" required onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label className="auth-input-wrap" htmlFor="register-password">
            <span className="auth-input-icon" aria-hidden="true">
              <LockIcon />
            </span>
            <input id="register-password" type="password" name="password" placeholder="Пароль" value={password} autoComplete="new-password" minLength={8} required onChange={(event) => setPassword(event.target.value)} />
          </label>
          <label className="auth-input-wrap" htmlFor="password_confirm">
            <span className="auth-input-icon" aria-hidden="true">
              <LockIcon />
            </span>
            <input id="password_confirm" type="password" name="password_confirm" placeholder="Подтверждение пароля" value={passwordConfirm} autoComplete="new-password" minLength={8} required onChange={(event) => setPasswordConfirm(event.target.value)} />
          </label>
          <button type="submit" className="btn auth-submit-btn" disabled={isSubmitting}>
            {isSubmitting ? 'Регистрация...' : 'Зарегистрироваться'}
          </button>
        </form>

        <p className="auth-switch">Уже есть аккаунт? <Link to="/login">Войти</Link></p>
      </div>
    </AuthScreenShell>
  )
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [devResetUrl, setDevResetUrl] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSuccessMessage('')
    setDevResetUrl('')
    setIsSubmitting(true)

    try {
      const result = await requestPasswordReset(email)
      setSuccessMessage(result.message)
      if (result.dev_reset_url) {
        setDevResetUrl(result.dev_reset_url)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отправить запрос.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthScreenShell>
      <div className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="forgot-password-title">
        <Link className="auth-modal-close" to="/login" aria-label="Закрыть">×</Link>
        <AuthModalBrand />
        <h1 className="auth-modal-title" id="forgot-password-title">Сброс пароля</h1>
        <p className="auth-modal-lead">
          Укажите email аккаунта. Мы отправим ссылку для установки нового пароля.
        </p>
        {successMessage ? (
          <div className="callout callout-success" role="status">{successMessage}</div>
        ) : null}
        {devResetUrl ? (
          <div className="callout auth-dev-reset" role="status">
            <p className="auth-dev-reset__label">Режим разработки (письмо не отправляется):</p>
            <Link className="auth-dev-reset__link" to={devResetUrl.replace(/^\/app/, '')}>
              Открыть ссылку сброса
            </Link>
          </div>
        ) : null}
        {error ? <div className="error">{error}</div> : null}
        {successMessage ? (
          <p className="auth-switch">
            <Link to="/login">Вернуться ко входу</Link>
          </p>
        ) : (
          <form className="auth-modal-form" onSubmit={handleSubmit}>
            <label className="auth-input-wrap" htmlFor="forgot-email">
              <span className="auth-input-icon" aria-hidden="true">
                <EmailIcon />
              </span>
              <input
                id="forgot-email"
                type="email"
                name="email"
                placeholder="Почта"
                value={email}
                autoComplete="email"
                required
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <button type="submit" className="btn auth-submit-btn" disabled={isSubmitting}>
              {isSubmitting ? 'Отправка...' : 'Отправить ссылку'}
            </button>
          </form>
        )}
        {!successMessage ? (
          <p className="auth-switch">
            Вспомнили пароль? <Link to="/login">Войти</Link>
          </p>
        ) : null}
      </div>
    </AuthScreenShell>
  )
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = (searchParams.get('token') || '').trim()
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [tokenState, setTokenState] = useState<'checking' | 'valid' | 'invalid'>('checking')

  useEffect(() => {
    let alive = true

    if (!token) {
      setTokenState('invalid')
      setError('Ссылка для сброса пароля не найдена.')
      return () => {
        alive = false
      }
    }

    setTokenState('checking')
    setError('')

    validatePasswordResetToken(token)
      .then(() => {
        if (alive) setTokenState('valid')
      })
      .catch(() => {
        if (alive) {
          setTokenState('invalid')
          setError('Ссылка для сброса пароля недействительна или устарела.')
        }
      })

    return () => {
      alive = false
    }
  }, [token])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (tokenState !== 'valid') return

    setError('')
    setIsSubmitting(true)

    try {
      await resetPasswordWithToken({
        token,
        password,
        password_confirm: passwordConfirm,
      })
      navigate('/login?reset=1', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось обновить пароль.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthScreenShell>
      <div className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="reset-password-title">
        <Link className="auth-modal-close" to="/login" aria-label="Закрыть">×</Link>
        <AuthModalBrand />
        <h1 className="auth-modal-title" id="reset-password-title">Новый пароль</h1>
        {tokenState === 'checking' ? (
          <p className="auth-modal-lead" role="status">Проверяем ссылку...</p>
        ) : null}
        {error ? <div className="error">{error}</div> : null}
        {tokenState === 'valid' ? (
          <form className="auth-modal-form" onSubmit={handleSubmit}>
            <label className="auth-input-wrap" htmlFor="reset-password">
              <span className="auth-input-icon" aria-hidden="true">
                <LockIcon />
              </span>
              <input
                id="reset-password"
                type="password"
                name="password"
                placeholder="Новый пароль"
                value={password}
                autoComplete="new-password"
                minLength={8}
                required
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <label className="auth-input-wrap" htmlFor="reset-password-confirm">
              <span className="auth-input-icon" aria-hidden="true">
                <LockIcon />
              </span>
              <input
                id="reset-password-confirm"
                type="password"
                name="password_confirm"
                placeholder="Подтверждение пароля"
                value={passwordConfirm}
                autoComplete="new-password"
                minLength={8}
                required
                onChange={(event) => setPasswordConfirm(event.target.value)}
              />
            </label>
            <button type="submit" className="btn auth-submit-btn" disabled={isSubmitting}>
              {isSubmitting ? 'Сохранение...' : 'Сохранить пароль'}
            </button>
          </form>
        ) : null}
        {tokenState === 'invalid' ? (
          <p className="auth-switch">
            <Link to="/forgot-password">Запросить новую ссылку</Link>
            {' · '}
            <Link to="/login">Войти</Link>
          </p>
        ) : (
          <p className="auth-switch">
            <Link to="/login">Вернуться ко входу</Link>
          </p>
        )}
      </div>
    </AuthScreenShell>
  )
}
