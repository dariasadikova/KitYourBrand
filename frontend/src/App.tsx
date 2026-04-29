import { type FormEvent, type ReactNode, useEffect, useState } from 'react'
import { Link, Navigate, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom'
import { getCurrentSession, login, register } from './services/authApi'
import { getProfile, updateProfile } from './services/profileApi'
import { createProject, deleteProject, listProjects } from './services/projectsApi'
import type { AuthMeResponse } from './types/auth'
import type { Profile } from './types/profile'
import type { ProjectSummary } from './types/project'

function App() {
  const [session, setSession] = useState<AuthMeResponse | null>(null)

  useEffect(() => {
    let alive = true

    getCurrentSession()
      .then((payload) => {
        if (alive) setSession(payload)
      })
      .catch(() => {
        if (alive) setSession({ ok: false, authenticated: false, user: null })
      })

    return () => {
      alive = false
    }
  }, [])

  return (
    <Routes>
      <Route path="/" element={<LandingPage session={session} />} />
      <Route path="/login" element={<LoginPage session={session} onSessionChange={setSession} />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/dashboard" element={<ProtectedDashboard session={session} />} />
      <Route path="/profile" element={<ProtectedProfile session={session} />} />
    </Routes>
  )
}

function ProtectedDashboard({ session }: { session: AuthMeResponse | null }) {
  if (session === null) return null
  if (!session.authenticated) return <Navigate to="/login" replace />

  return <MigrationShell session={session} />
}

function ProtectedProfile({ session }: { session: AuthMeResponse | null }) {
  if (session === null) return null
  if (!session.authenticated) return <Navigate to="/login" replace />

  return (
    <MigrationShell session={session} activePath="/profile" mainClassName="profile-main">
      <ProfilePage />
    </MigrationShell>
  )
}

function LandingHeader({ session }: { session: AuthMeResponse | null }) {
  return (
    <header className="site-header">
      <div className="container header-inner">
        <Link to="/" className="brand-mark" aria-label="KYBBY home">
          <img className="brand-mark__logo" src="/static/img/kybby-whale.svg" alt="KYBBY" />
          <span className="brand-mark__text">KYBBY</span>
        </Link>

        <nav className="header-actions">
          {session?.authenticated ? (
            <>
              <Link to="/dashboard" className="btn btn-primary">Мои проекты</Link>
              <a href="/profile" className="header-user-pill header-user-pill--link">{session.user?.name || 'Пользователь'}</a>
              <a href="/logout" className="btn btn-outline">Выйти</a>
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn-outline">Вход</Link>
              <Link to="/register" className="btn btn-primary">Регистрация</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}

function LandingPage({ session }: { session: AuthMeResponse | null }) {
  return (
    <div className="landing-shell">
      <LandingHeader session={session} />
      <LandingBackdrop />
      <footer className="site-footer">
        <div className="container footer-inner">
          <div className="brand-mark brand-mark--footer">
            <img className="brand-mark__logo brand-mark__logo--footer" src="/static/img/kybby-whale.svg" alt="KYBBY" />
            <span className="brand-mark__text">KYBBY</span>
          </div>
          <p>© 2026 KYBBY. Генерация бренд-комплектов с помощью ИИ.</p>
        </div>
      </footer>
    </div>
  )
}

function LandingBackdrop() {
  return (
    <main>
      <section className="hero-section">
        <div className="hero-bg" aria-hidden="true">
          <div className="hero-bg__orb hero-bg__orb--1"></div>
          <div className="hero-bg__orb hero-bg__orb--2"></div>
        </div>
        <div className="container hero-content">
          <h1 className="hero-title">
            <span className="hero-title__line hero-title__line--light">Создайте бренд-стиль</span>
            <span className="hero-title__line hero-title__line--accent">за минуты</span>
          </h1>
          <p className="hero-subtitle">Логотипы, иконки, паттерны, иллюстрации — всё в одном месте.</p>
          <a href="#features" className="btn btn-primary btn-hero btn-hero--demo">Посмотреть демо</a>
        </div>
      </section>
      <section className="features-section section-block" id="features">
        <div className="container section-head section-head-center">
          <h2>Возможности платформы</h2>
          <p>Всё, что нужно для создания целостного визуального стиля</p>
        </div>

        <div className="container feature-grid">
          <article className="feature-card">
            <div className="feature-icon" aria-hidden="true">✦</div>
            <h3>Генерация иконок</h3>
            <p>Создавайте уникальные иконки в едином стиле с настраиваемой цветовой палитрой и параметрами.</p>
          </article>
          <article className="feature-card">
            <div className="feature-icon" aria-hidden="true">▦</div>
            <h3>Создание паттернов</h3>
            <p>Бесшовные паттерны и фоны с заданными мотивами и плотностью для любых дизайн-задач.</p>
          </article>
          <article className="feature-card">
            <div className="feature-icon" aria-hidden="true">□</div>
            <h3>Иллюстрации</h3>
            <p>Векторные иллюстрации, созданные ИИ в соответствии с вашим брендом и референсами.</p>
          </article>
          <article className="feature-card">
            <div className="feature-icon" aria-hidden="true">↓</div>
            <h3>Экспорт в Figma</h3>
            <p>Прямая интеграция с Figma через плагин — все ассеты доступны сразу в вашем проекте.</p>
          </article>
        </div>
      </section>
    </main>
  )
}

function LoginPage({
  session,
  onSessionChange,
}: {
  session: AuthMeResponse | null
  onSessionChange: (session: AuthMeResponse) => void
}) {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (session?.authenticated) return <Navigate to="/dashboard" replace />

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      const nextSession = await login({ email, password })
      onSessionChange(nextSession)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось войти.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="landing-shell register-shell">
      <LandingHeader session={session} />
      <div className="page-blur-layer" aria-hidden="true">
        <LandingBackdrop />
      </div>
      <main className="register-page">
        <section className="register-modal auth-modal" role="dialog" aria-modal="true" aria-labelledby="login-title">
          <Link to="/" className="register-close" aria-label="Закрыть окно входа">✕</Link>
          <Link to="/" className="register-brand" aria-label="На главную">
            <img className="brand-mark__logo brand-mark__logo--small" src="/static/img/kybby-whale.svg" alt="KYBBY" />
            <span className="register-brand__text">KYBBY</span>
          </Link>
          <h1 className="register-title" id="login-title">Войти</h1>

          {error ? <div className="form-alert form-alert--error">{error}</div> : null}
          {searchParams.get('registered') === '1' ? (
            <div className="form-alert form-alert--success">Аккаунт создан. Теперь можно войти, используя email и пароль.</div>
          ) : null}

          <form className="register-form" onSubmit={handleSubmit}>
            <label className="field-wrap">
              <span className="field-icon" aria-hidden="true">
                <EmailIcon />
              </span>
              <input type="email" name="email" placeholder="Почта" value={email} autoComplete="email" required onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label className="field-wrap">
              <span className="field-icon" aria-hidden="true">
                <LockIcon />
              </span>
              <input type="password" name="password" placeholder="Пароль" autoComplete="current-password" required onChange={(event) => setPassword(event.target.value)} />
            </label>
            <button type="submit" className="btn btn-primary btn-full" disabled={isSubmitting}>
              {isSubmitting ? 'Входим...' : 'Войти'}
            </button>
          </form>

          <p className="register-switch">Нет аккаунта? <Link to="/register">Регистрация</Link></p>
        </section>
      </main>
    </div>
  )
}

function RegisterPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

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
    <div className="landing-shell register-shell">
      <LandingHeader session={null} />
      <div className="page-blur-layer" aria-hidden="true">
        <LandingBackdrop />
      </div>
      <main className="register-page">
        <section className="register-modal" role="dialog" aria-modal="true" aria-labelledby="register-title">
          <Link to="/" className="register-close" aria-label="Закрыть окно регистрации">✕</Link>
          <Link to="/" className="register-brand" aria-label="На главную">
            <img className="brand-mark__logo brand-mark__logo--small" src="/static/img/kybby-whale.svg" alt="KYBBY" />
            <span className="register-brand__text">KYBBY</span>
          </Link>
          <h1 className="register-title" id="register-title">Регистрация</h1>

          {error ? <div className="form-alert form-alert--error">{error}</div> : null}

          <form className="register-form" onSubmit={handleSubmit}>
            <label className="field-wrap">
              <span className="field-icon" aria-hidden="true">
                <UserIcon />
              </span>
              <input type="text" name="name" placeholder="Имя" value={name} autoComplete="name" required onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="field-wrap">
              <span className="field-icon" aria-hidden="true">
                <EmailIcon />
              </span>
              <input type="email" name="email" placeholder="Почта" value={email} autoComplete="email" required onChange={(event) => setEmail(event.target.value)} />
            </label>
            <label className="field-wrap">
              <span className="field-icon" aria-hidden="true">
                <LockIcon />
              </span>
              <input type="password" name="password" placeholder="Пароль" autoComplete="new-password" required onChange={(event) => setPassword(event.target.value)} />
            </label>
            <label className="field-wrap">
              <span className="field-icon" aria-hidden="true">
                <LockIcon />
              </span>
              <input type="password" name="password_confirm" placeholder="Подтверждение пароля" autoComplete="new-password" required onChange={(event) => setPasswordConfirm(event.target.value)} />
            </label>
            <button type="submit" className="btn btn-primary btn-full" disabled={isSubmitting}>
              {isSubmitting ? 'Регистрируем...' : 'Зарегистрироваться'}
            </button>
          </form>

          <p className="register-switch">Уже есть аккаунт? <Link to="/login">Войти</Link></p>
        </section>
      </main>
    </div>
  )
}

function MigrationShell({
  session,
  activePath = '/dashboard',
  mainClassName = '',
  children,
}: {
  session: AuthMeResponse | null
  activePath?: '/dashboard' | '/profile'
  mainClassName?: string
  children?: ReactNode
}) {
  const userName = session?.user?.name || 'Пользователь'
  const userEmail = session?.user?.email || ''
  const userInitial = userName.slice(0, 1).toUpperCase() || '?'

  return (
    <div className="dashboard-page">
      <header className="dashboard-page-header">
        <div className="dashboard-page-header__brand">
          <a href="/dashboard" className="dashboard-brand dashboard-brand--header" aria-label="KYBBY dashboard">
            <img className="brand-mark__logo" src="/static/img/kybby-whale.svg" alt="KYBBY" />
            <span className="brand-mark__text">KYBBY</span>
          </a>
        </div>
        <div className="dashboard-page-header__actions">
          <div className="dashboard-userbar">
            <button type="button" className="dashboard-icon-btn" aria-label="Уведомления">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
              <span className="dashboard-badge"></span>
            </button>
            <div className="dashboard-userpill">
              <span className="dashboard-userpill__email">{userEmail}</span>
              <span className="dashboard-userpill__avatar">{userInitial}</span>
            </div>
          </div>
        </div>
      </header>
      <div className="dashboard-shell">
        <aside className="dashboard-sidebar">
          <nav className="dashboard-nav" aria-label="Основная навигация">
            <Link to="/dashboard" className={`dashboard-nav__item${activePath === '/dashboard' ? ' dashboard-nav__item--active' : ''}`}>
              <span className="dashboard-nav__icon" aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
                </svg>
              </span>
              <span>Мои проекты</span>
            </Link>
            <Link to="/profile" className={`dashboard-nav__item${activePath === '/profile' ? ' dashboard-nav__item--active' : ''}`}>
              <span className="dashboard-nav__icon" aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20a8 8 0 0 1 16 0" />
                </svg>
              </span>
              <span>Профиль</span>
            </Link>
            <a href="#" className="dashboard-nav__item">
              <span className="dashboard-nav__icon" aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 0 1 0 2.8 2 2 0 0 1-2.8 0l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.6h.1a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.6 1Z" />
                </svg>
              </span>
              <span>Настройки</span>
            </a>
            <a href="/logout" className="dashboard-nav__item">
              <span className="dashboard-nav__icon" aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
                  <path d="M16 17l5-5-5-5" />
                  <path d="M21 12H9" />
                </svg>
              </span>
              <span>Выход</span>
            </a>
          </nav>
        </aside>
        <main className={`dashboard-main${mainClassName ? ` ${mainClassName}` : ''}`}>
          {children || <ProjectsDashboard />}
        </main>
      </div>
      <footer className="dashboard-site-footer">
        <div className="dashboard-site-footer__inner">
          <div className="brand-mark brand-mark--dashboard-footer">
            <img className="brand-mark__logo" src="/static/img/kybby-whale.svg" alt="KYBBY" />
            <span className="brand-mark__text">KYBBY</span>
          </div>
          <p>© 2026 KYBBY. Генерация бренд-комплектов с помощью ИИ.</p>
        </div>
      </footer>
    </div>
  )
}

function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [name, setName] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [avatar, setAvatar] = useState<File | null>(null)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    let alive = true

    getProfile()
      .then((payload) => {
        if (!alive) return
        setProfile(payload.profile)
        setName(payload.profile.name)
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : 'Не удалось загрузить профиль.')
      })
      .finally(() => {
        if (alive) setIsLoading(false)
      })

    return () => {
      alive = false
    }
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSuccess('')
    setIsSaving(true)

    const formData = new FormData()
    formData.append('name', name)
    formData.append('new_password', newPassword)
    formData.append('remove_avatar', '0')
    if (avatar) formData.append('avatar', avatar)

    try {
      const payload = await updateProfile(formData)
      setProfile(payload.profile)
      setName(payload.profile.name)
      setNewPassword('')
      setAvatar(null)
      setSuccess('Изменения сохранены')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить профиль.')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleRemoveAvatar() {
    setError('')
    setSuccess('')

    const formData = new FormData()
    formData.append('name', name)
    formData.append('new_password', '')
    formData.append('remove_avatar', '1')

    try {
      const payload = await updateProfile(formData)
      setProfile(payload.profile)
      setSuccess('Изменения сохранены')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить фото профиля.')
    }
  }

  if (isLoading) {
    return (
      <section className="profile-page">
        <div className="profile-page__head">
          <h1>Профиль пользователя</h1>
          <p>Управляйте настройками вашего аккаунта</p>
        </div>
        <div className="profile-alert">Загружаем профиль...</div>
      </section>
    )
  }

  return (
    <section className="profile-page">
      <div className="profile-page__head">
        <h1>Профиль пользователя</h1>
        <p>Управляйте настройками вашего аккаунта</p>
      </div>

      {error ? <div className="profile-alert profile-alert--error">{error}</div> : null}
      {success ? <div className="profile-alert profile-alert--success">{success}</div> : null}

      <form className="profile-form" onSubmit={handleSubmit}>
        <article className="profile-card">
          <h2>Основная информация</h2>
          <div className="profile-info-grid">
            <div className="profile-avatar-block">
              <div className="profile-avatar-frame">
                {profile?.avatar_url ? (
                  <>
                    <img src={profile.avatar_url} alt="Аватар пользователя" className="profile-avatar-image" />
                    <button type="button" className="profile-avatar-delete-btn" aria-label="Удалить фото профиля" title="Удалить фото" onClick={handleRemoveAvatar}>
                      <svg viewBox="0 0 512 512" aria-hidden="true">
                        <path d="M135.2 17.7L128 32H32C14.3 32 0 46.3 0 64s14.3 32 32 32H480c17.7 0 32-14.3 32-32s-14.3-32-32-32H384l-7.2-14.3C366 6.9 349.6 0 332.8 0H179.2c-16.8 0-33.2 6.9-44 17.7zM32 128H480L456.7 467.1c-1.7 24.6-22.1 43.9-46.8 43.9H102.1c-24.7 0-45.1-19.3-46.8-43.9L32 128z" />
                      </svg>
                    </button>
                  </>
                ) : (
                  <div className="profile-avatar-circle">{profile?.initial || '?'}</div>
                )}
              </div>
              <label className="btn btn-outline btn-inline profile-upload-btn">
                Загрузить фото
                <input type="file" name="avatar" accept=".png,.jpg,.jpeg,.webp" hidden onChange={(event) => setAvatar(event.target.files?.[0] || null)} />
              </label>
            </div>

            <div className="profile-fields">
              <label className="editor-field">
                <span>ФИО</span>
                <input type="text" name="name" value={name} minLength={2} required onChange={(event) => setName(event.target.value)} />
              </label>
              <label className="editor-field">
                <span>Email</span>
                <input type="email" className="profile-email-input" value={profile?.email || ''} disabled />
              </label>
              <p className="profile-field-hint">Email нельзя изменить</p>
              <div className="profile-role-row">
                <span>Роль:</span>
                <strong>User</strong>
              </div>
            </div>
          </div>
        </article>

        <article className="profile-card">
          <h2>Смена пароля</h2>
          <div className="profile-password-grid">
            <label className="editor-field">
              <span>Текущий пароль</span>
              <input type="password" className="profile-current-password" value="••••••••••••" disabled />
            </label>
            <label className="editor-field">
              <span>Новый пароль</span>
              <input type="password" name="new_password" placeholder="Введите новый пароль" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
              <p className="profile-field-hint">Минимум 8 символов</p>
            </label>
          </div>
        </article>

        <div className="profile-actions">
          <Link to="/profile" className="btn btn-outline btn-inline">Отмена</Link>
          <button type="submit" className="btn btn-primary btn-inline" disabled={isSaving}>
            {isSaving ? 'Сохраняем...' : 'Сохранить изменения'}
          </button>
        </div>
      </form>
    </section>
  )
}

function ProjectsDashboard() {
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [showGenerationHistory, setShowGenerationHistory] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true

    listProjects()
      .then((payload) => {
        if (!alive) return
        setProjects(payload.projects)
        setShowGenerationHistory(payload.show_generation_history)
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : 'Не удалось загрузить проекты.')
      })
      .finally(() => {
        if (alive) setIsLoading(false)
      })

    return () => {
      alive = false
    }
  }, [])

  async function handleCreateProject() {
    setError('')
    setIsCreating(true)

    try {
      const payload = await createProject()
      window.location.href = payload.redirect_url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать проект.')
      setIsCreating(false)
    }
  }

  async function handleDeleteProject(project: ProjectSummary) {
    if (!window.confirm(`Удалить проект "${project.name}"?`)) return

    setError('')
    try {
      await deleteProject(project.slug)
      setProjects((items) => items.filter((item) => item.slug !== project.slug))
      setShowGenerationHistory(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить проект.')
    }
  }

  return (
    <section className="dashboard-content">
      <div className="dashboard-head">
        <h1>Мои проекты</h1>
        <div className="dashboard-head__actions">
          {showGenerationHistory ? (
            <a href="/generation-history" className="btn btn-outline dashboard-history-btn">Посмотреть историю генераций</a>
          ) : null}
          <form className="dashboard-create-form" onSubmit={(event) => event.preventDefault()}>
            <input type="hidden" name="name" value="Новый проект" />
            <button type="button" className="btn btn-primary dashboard-create-btn" disabled={isCreating} onClick={handleCreateProject}>
              {isCreating ? 'Создаём...' : 'Создать проект'}
            </button>
          </form>
        </div>
      </div>

      {error ? <div className="form-alert form-alert--error">{error}</div> : null}

      {isLoading ? (
        <div className="dashboard-empty">
          <p>Загружаем проекты...</p>
        </div>
      ) : projects.length > 0 ? (
        <div className="project-grid">
          {projects.map((project) => (
            <article className="project-card" key={project.slug}>
              <a href={project.results_url} className="project-card__main-link" aria-label={`Открыть результаты генерации ${project.name}`}></a>
              <div className="project-card__icon">
                <span>✦</span>
                <span>✦</span>
              </div>
              <div className="project-card__body">
                <h2>{project.name}</h2>
                <p>Дата создания:</p>
                <span>{project.created_at.slice(0, 10)}</span>
              </div>
              <div className="project-card__actions">
                <form className="project-card__delete-form" onSubmit={(event) => event.preventDefault()}>
                  <button
                    type="button"
                    className="project-card__action project-card__action--delete"
                    aria-label="Удалить проект"
                    onClick={() => handleDeleteProject(project)}
                  >
                    🗑
                  </button>
                </form>
                <a href={project.editor_url} className="project-card__action" aria-label="Открыть редактор проекта">✎</a>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="dashboard-empty">
          <p>У вас пока нет проектов. Создайте первый проект и сразу перейдите к его редактированию.</p>
        </div>
      )}
    </section>
  )
}

function UserIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="7.5" r="3.5" />
      <path d="M6.5 19a5.5 5.5 0 0 1 11 0" />
    </svg>
  )
}

function EmailIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="5.5" width="17" height="13" rx="2.6" />
      <path d="M4.8 7.3 12 12.7l7.2-5.4" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="9" rx="2.6" />
      <path d="M8 11V8.3a4 4 0 1 1 8 0V11" />
    </svg>
  )
}

export default App
