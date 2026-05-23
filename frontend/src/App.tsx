import {
  type ChangeEvent,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { cancelGenerationJob, deleteGenerationHistorySelected, getGenerationHistory } from './services/generationHistoryApi'
import {
  getCurrentSession,
  login,
  logout,
  register,
  requestPasswordReset,
  resetPasswordWithToken,
  validatePasswordResetToken,
} from './services/authApi'
import { getProfile, updateProfile } from './services/profileApi'
import { createProject, deleteProject, importProjectBundle, listProjects, restoreProject } from './services/projectsApi'
import {
  deleteProjectEditorRef,
  getProjectEditor,
  resetProjectEditor,
  saveProjectEditor,
  startProjectGeneration,
  suggestProjectPalette,
  uploadProjectEditorRefs,
} from './services/editorApi'
import {
  cancelGenerationJob as cancelResultsGenerationJob,
  generateFigmaManifest,
  getActiveGenerationJob,
  getGenerationJob,
  getProjectResults,
} from './services/resultsApi'
import {
  PROVIDER_NEWS_ENTRIES,
  PROVIDER_NEWS_VERSION,
  providerNewsStorageKey,
  readSeenProviderNewsVersion,
} from './config/providerNews'
import type { AuthMeResponse } from './types/auth'
import type { GenerationHistoryResponse, GenerationHistoryRow } from './types/generationHistory'
import type { Profile } from './types/profile'
import type { ProjectSummary } from './types/project'
import type { GenerationJob, ProjectResultsResponse, ResultAsset } from './types/results'
import { BrandMockupsPreview } from './components/mockups/BrandMockupsPreview'
import { GENERATION_PROVIDERS } from './constants/generationProviders'
import type { PaletteVariant, PaletteVariantName, ProjectEditorResponse, ProjectTokens } from './types/editor'

function providerLabel(provider: string): string {
  return GENERATION_PROVIDERS.find((item) => item.slug === provider)?.label
    || provider.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

function generationProviderEntries(statuses: Record<string, string | undefined>) {
  const known = GENERATION_PROVIDERS.map((provider) => provider.slug)
  const extra = Object.keys(statuses || {}).filter((provider) => !known.includes(provider as typeof known[number]))
  return [...known, ...extra].map((provider) => ({ slug: provider, label: providerLabel(provider) }))
}

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

  async function handleLogout() {
    try {
      const payload = await logout()
      setSession(payload)
    } catch {
      setSession({ ok: false, authenticated: false, user: null })
    }
  }

  async function refreshSession() {
    try {
      setSession(await getCurrentSession())
    } catch {
      /* не сбрасываем сессию при сетевой ошибке */
    }
  }

  return (
    <Routes>
      <Route path="/" element={<LandingPage session={session} onLogout={handleLogout} />} />
      <Route path="/login" element={<LoginPage session={session} onSessionChange={setSession} />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/dashboard" element={<ProtectedDashboard session={session} onLogout={handleLogout} />} />
      <Route path="/profile" element={<ProtectedProfile session={session} onLogout={handleLogout} onSessionRefresh={refreshSession} />} />
      <Route path="/figma-plugin" element={<ProtectedFigmaPlugin session={session} onLogout={handleLogout} />} />
      <Route path="/generation-history" element={<ProtectedGenerationHistory session={session} onLogout={handleLogout} />} />
      <Route path="/projects/:projectSlug" element={<ProtectedEditor session={session} onLogout={handleLogout} />} />
      <Route path="/projects/:projectSlug/results" element={<ProtectedResults session={session} onLogout={handleLogout} />} />
    </Routes>
  )
}

function ProtectedDashboard({ session, onLogout }: { session: AuthMeResponse | null; onLogout: () => Promise<void> }) {
  if (session === null) return null
  if (!session.authenticated) return <Navigate to="/" replace />

  return <MigrationShell session={session} onLogout={onLogout} />
}

function ProtectedProfile({ session, onLogout, onSessionRefresh }: { session: AuthMeResponse | null; onLogout: () => Promise<void>; onSessionRefresh: () => Promise<void> }) {
  if (session === null) return null
  if (!session.authenticated) return <Navigate to="/" replace />

  return (
    <MigrationShell session={session} activePath="/profile" mainClassName="profile-main" onLogout={onLogout}>
      <ProfilePage onSessionRefresh={onSessionRefresh} />
    </MigrationShell>
  )
}

function ProtectedFigmaPlugin({ session, onLogout }: { session: AuthMeResponse | null; onLogout: () => Promise<void> }) {
  if (session === null) return null
  if (!session.authenticated) return <Navigate to="/" replace />

  return (
    <MigrationShell session={session} activePath="/figma-plugin" mainClassName="profile-main" onLogout={onLogout}>
      <FigmaPluginPage />
    </MigrationShell>
  )
}

function ProtectedGenerationHistory({ session, onLogout }: { session: AuthMeResponse | null; onLogout: () => Promise<void> }) {
  if (session === null) return null
  if (!session.authenticated) return <Navigate to="/" replace />

  return (
    <MigrationShell session={session} activePath="/generation-history" onLogout={onLogout}>
      <GenerationHistoryPage />
    </MigrationShell>
  )
}

function ProtectedResults({ session, onLogout }: { session: AuthMeResponse | null; onLogout: () => Promise<void> }) {
  const { projectSlug = '' } = useParams()

  if (session === null) return null
  if (!session.authenticated) return <Navigate to="/" replace />

  return (
    <MigrationShell session={session} activePath="/dashboard" mainClassName="results-main" onLogout={onLogout}>
      <ResultsPage projectSlug={projectSlug} />
    </MigrationShell>
  )
}

function ProtectedEditor({ session, onLogout }: { session: AuthMeResponse | null; onLogout: () => Promise<void> }) {
  const { projectSlug = '' } = useParams()
  const [searchParams] = useSearchParams()

  if (session === null) return null
  if (!session.authenticated) return <Navigate to="/" replace />

  return (
    <MigrationShell session={session} activePath="/dashboard" mainClassName="project-main" onLogout={onLogout}>
      <ProjectEditorPage projectSlug={projectSlug} isNewProjectFlow={searchParams.get('new') === '1'} />
    </MigrationShell>
  )
}

function LandingHeader({ session, onLogout }: { session: AuthMeResponse | null; onLogout?: () => Promise<void> }) {
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [menuOpen])

  async function handleLogoutClick(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault()
    if (!onLogout) return
    setMenuOpen(false)
    navigate('/', { replace: true })
    await onLogout()
  }

  function closeMenu() {
    setMenuOpen(false)
  }

  return (
    <header className={`site-header landing-header${menuOpen ? ' landing-header--open' : ''}`}>
      <div className="container header-inner landing-header__inner">
        <Link to="/" className="brand-mark landing-header__brand" aria-label="KYBBY home" onClick={closeMenu}>
          <img className="brand-mark__logo" src="/app/static/img/kybby-logo.png" alt="" />
          <span className="brand-mark__text landing-header__brand-text">KYBBY</span>
        </Link>

        <button
          type="button"
          className="landing-header__burger"
          aria-expanded={menuOpen}
          aria-controls="landing-menu"
          aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className="landing-header__burger-lines" aria-hidden="true">
            <span className="landing-header__burger-line" />
            <span className="landing-header__burger-line" />
            <span className="landing-header__burger-line" />
          </span>
        </button>

        <nav className="header-actions landing-header__nav" id="landing-menu">
          {session?.authenticated ? (
            <>
              <Link to="/dashboard" className="btn btn-primary" onClick={closeMenu}>
                Мои проекты
              </Link>
              <Link to="/profile" className="header-user-pill header-user-pill--link" onClick={closeMenu}>
                {session.user?.name || 'Пользователь'}
              </Link>
              <a href="/logout" className="btn btn-outline" onClick={handleLogoutClick}>
                Выйти
              </a>
            </>
          ) : (
            <>
              <Link to="/login" className="btn btn-outline" onClick={closeMenu}>
                Вход
              </Link>
              <Link to="/register" className="btn btn-primary" onClick={closeMenu}>
                Регистрация
              </Link>
            </>
          )}
        </nav>
      </div>
      {menuOpen ? (
        <button
          type="button"
          className="landing-header__overlay"
          tabIndex={-1}
          aria-label="Закрыть меню"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}
    </header>
  )
}

function LandingPage({ session, onLogout }: { session: AuthMeResponse | null; onLogout: () => Promise<void> }) {
  return (
    <div className="landing-shell">
      <LandingHeader session={session} onLogout={onLogout} />
      <LandingBackdrop />
      <footer className="site-footer">
        <div className="container footer-inner">
          <div className="brand-mark brand-mark--footer">
            <img className="brand-mark__logo brand-mark__logo--footer" src="/app/static/img/kybby-logo.png" alt="KYBBY" />
            <span className="brand-mark__text">KYBBY</span>
          </div>
          <p>© 2026 KYBBY. Генерация бренд-комплектов с помощью ИИ.</p>
        </div>
      </footer>
    </div>
  )
}

type Feature = {
  title: string
  description: string
  icon: 'sparkles' | 'grid3x3' | 'image' | 'download'
}

const LANDING_FEATURES: readonly Feature[] = [
  {
    title: 'Генерация иконок',
    description: 'Создавайте уникальные иконки в едином стиле с настраиваемой цветовой палитрой и параметрами.',
    icon: 'sparkles',
  },
  {
    title: 'Создание паттернов',
    description: 'Бесшовные паттерны и фоны с заданными мотивами и плотностью для любых дизайн-задач.',
    icon: 'grid3x3',
  },
  {
    title: 'Иллюстрации',
    description: 'Векторные иллюстрации, созданные ИИ в соответствии с вашим брендом и референсами.',
    icon: 'image',
  },
  {
    title: 'Экспорт в Figma',
    description: 'Прямая интеграция с Figma через плагин — все ассеты доступны сразу в вашем проекте.',
    icon: 'download',
  },
]

function FeatureIcon({ name }: { name: Feature['icon'] }) {
  if (name === 'sparkles') {
    return (
      <svg className="feature-icon__svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
        <path d="M5 3v4" />
        <path d="M19 17v4" />
        <path d="M3 5h4" />
        <path d="M17 19h4" />
      </svg>
    )
  }

  if (name === 'grid3x3') {
    return (
      <svg className="feature-icon__svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect width="7" height="7" x="3" y="3" rx="1" />
        <rect width="7" height="7" x="14" y="3" rx="1" />
        <rect width="7" height="7" x="14" y="14" rx="1" />
        <rect width="7" height="7" x="3" y="14" rx="1" />
      </svg>
    )
  }

  if (name === 'image') {
    return (
      <svg className="feature-icon__svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
      </svg>
    )
  }

  return (
    <svg className="feature-icon__svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="15" y2="3" />
    </svg>
  )
}

function LandingBackdrop() {
  return (
    <main>
      <section className="hero-section">
        <div className="hero-bg" aria-hidden="true">
          <div className="hero-bg__orb hero-bg__orb--1"></div>
          <div className="hero-bg__orb hero-bg__orb--2"></div>
          <div className="hero-bg__dots hero-bg__dots--left"></div>
          <div className="hero-bg__dots hero-bg__dots--right"></div>
        </div>
        <div className="container hero-content">
          <h1 className="hero-title">
            <span className="hero-title__line hero-title__line--light">Создайте бренд-стиль</span>
            <span className="hero-title__line hero-title__line--accent">за минуты</span>
          </h1>
          <p className="hero-subtitle">Логотипы, иконки, паттерны, иллюстрации — всё в одном месте.</p>
          <a href="#features" className="btn btn-hero--demo">Посмотреть демо</a>
        </div>
        <a href="#features" className="hero-scroll" aria-label="Прокрутить к возможностям">
          <span className="hero-scroll__mouse">
            <span className="hero-scroll__dot"></span>
          </span>
        </a>
      </section>
      <section className="features-section section-block" id="features">
        <div className="container section-head section-head-center">
          <h2>Возможности платформы</h2>
          <p>Всё, что нужно для создания целостного визуального стиля</p>
        </div>

        <div className="container feature-grid">
          {LANDING_FEATURES.map((item) => (
            <article className="feature-card" key={item.title}>
              <div className="feature-icon" aria-hidden="true">
                <FeatureIcon name={item.icon} />
              </div>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
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
  const queryError = searchParams.get('error') || ''

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
    <div className="auth-screen">
      <div className="auth-backdrop-content" aria-hidden="true">
        <h1 className="auth-backdrop-title">
          <span>Создайте бренд-стиль</span>
          <span className="auth-backdrop-title-accent">за минуты</span>
        </h1>
      </div>
      <div className="auth-backdrop-blur"></div>
      <div className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="login-title">
        <Link className="auth-modal-close" to="/" aria-label="Закрыть">×</Link>
        <div className="auth-modal-brand">
          <img className="auth-modal-brand-logo" src="/app/static/img/kybby-logo.png" alt="" />
          <span>KYBBY</span>
        </div>
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
    </div>
  )
}

function RegisterPage() {
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
    <div className="auth-screen">
      <div className="auth-backdrop-content" aria-hidden="true">
        <h1 className="auth-backdrop-title">
          <span>Создайте бренд-стиль</span>
          <span className="auth-backdrop-title-accent">за минуты</span>
        </h1>
      </div>
      <div className="auth-backdrop-blur"></div>
      <div className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="register-title">
        <Link className="auth-modal-close" to="/" aria-label="Закрыть">×</Link>
        <div className="auth-modal-brand">
          <img className="auth-modal-brand-logo" src="/app/static/img/kybby-logo.png" alt="" />
          <span>KYBBY</span>
        </div>
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
    </div>
  )
}

function ForgotPasswordPage() {
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
    <div className="auth-screen">
      <div className="auth-backdrop-content" aria-hidden="true">
        <h1 className="auth-backdrop-title">
          <span>Создайте бренд-стиль</span>
          <span className="auth-backdrop-title-accent">за минуты</span>
        </h1>
      </div>
      <div className="auth-backdrop-blur"></div>
      <div className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="forgot-password-title">
        <Link className="auth-modal-close" to="/login" aria-label="Закрыть">×</Link>
        <div className="auth-modal-brand">
          <img className="auth-modal-brand-logo" src="/app/static/img/kybby-logo.png" alt="" />
          <span>KYBBY</span>
        </div>
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
    </div>
  )
}

function ResetPasswordPage() {
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
    <div className="auth-screen">
      <div className="auth-backdrop-content" aria-hidden="true">
        <h1 className="auth-backdrop-title">
          <span>Создайте бренд-стиль</span>
          <span className="auth-backdrop-title-accent">за минуты</span>
        </h1>
      </div>
      <div className="auth-backdrop-blur"></div>
      <div className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="reset-password-title">
        <Link className="auth-modal-close" to="/login" aria-label="Закрыть">×</Link>
        <div className="auth-modal-brand">
          <img className="auth-modal-brand-logo" src="/app/static/img/kybby-logo.png" alt="" />
          <span>KYBBY</span>
        </div>
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
    </div>
  )
}

type DashboardShellActivePath = '/dashboard' | '/profile' | '/generation-history' | '/figma-plugin'

function DashboardShellNav({
  activePath,
  mobileNavId,
  className,
  onItemNavigate,
  onLogoutClick,
}: {
  activePath: DashboardShellActivePath
  mobileNavId?: string
  className?: string
  onItemNavigate?: () => void
  onLogoutClick: (event: MouseEvent<HTMLAnchorElement>) => void
}) {
  const navClass = [className, 'dashboard-nav'].filter(Boolean).join(' ')

  return (
    <nav className={navClass} id={mobileNavId} aria-label="Основная навигация">
      <Link
        to="/dashboard"
        className={`dashboard-nav__item${activePath === '/dashboard' ? ' dashboard-nav__item--active' : ''}`}
        onClick={onItemNavigate}
      >
        <span className="dashboard-nav__icon" aria-hidden="true">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
          </svg>
        </span>
        <span className="dashboard-nav__label">Мои проекты</span>
      </Link>
      <Link
        to="/generation-history"
        className={`dashboard-nav__item${activePath === '/generation-history' ? ' dashboard-nav__item--active' : ''}`}
        onClick={onItemNavigate}
      >
        <span className="dashboard-nav__icon" aria-hidden="true">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
        </span>
        <span className="dashboard-nav__label">История генераций</span>
      </Link>
      <Link to="/figma-plugin" className={`dashboard-nav__item${activePath === '/figma-plugin' ? ' dashboard-nav__item--active' : ''}`} onClick={onItemNavigate}>
        <span className="dashboard-nav__icon" aria-hidden="true">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
          </svg>
        </span>
        <span className="dashboard-nav__label">Figma-плагин</span>
      </Link>
      <Link to="/profile" className={`dashboard-nav__item${activePath === '/profile' ? ' dashboard-nav__item--active' : ''}`} onClick={onItemNavigate}>
        <span className="dashboard-nav__icon" aria-hidden="true">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20a8 8 0 0 1 16 0" />
          </svg>
        </span>
        <span className="dashboard-nav__label">Профиль</span>
      </Link>
      <a href="/logout" className="dashboard-nav__item" onClick={(event) => { onItemNavigate?.(); onLogoutClick(event) }}>
        <span className="dashboard-nav__icon" aria-hidden="true">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
            <path d="M16 17l5-5-5-5" />
            <path d="M21 12H9" />
          </svg>
        </span>
        <span className="dashboard-nav__label">Выход</span>
      </a>
    </nav>
  )
}

function MigrationShell({
  session,
  activePath = '/dashboard',
  mainClassName = '',
  onLogout,
  children,
}: {
  session: AuthMeResponse | null
  activePath?: DashboardShellActivePath
  mainClassName?: string
  onLogout: () => Promise<void>
  children?: ReactNode
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const userName = session?.user?.name || 'Пользователь'
  const userEmail = session?.user?.email || ''
  const userId = session?.user?.id
  const avatarUrl = (session?.user?.avatar_url || '').trim()
  const userInitial = userName.slice(0, 1).toUpperCase() || '?'
  const [seenProviderNewsVersion, setSeenProviderNewsVersion] = useState(() =>
    session?.user?.id != null ? readSeenProviderNewsVersion(session.user.id) : 0,
  )

  useEffect(() => {
    if (userId == null) return
    setSeenProviderNewsVersion(readSeenProviderNewsVersion(userId))
  }, [userId])

  const hasUnreadProviderNews = userId != null && seenProviderNewsVersion < PROVIDER_NEWS_VERSION

  useEffect(() => {
    setMobileNavOpen(false)
  }, [location.pathname])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMobileNavOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!mobileNavOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [mobileNavOpen])

  function markProviderNewsSeen() {
    if (userId == null || seenProviderNewsVersion >= PROVIDER_NEWS_VERSION) return
    try {
      localStorage.setItem(providerNewsStorageKey(userId), String(PROVIDER_NEWS_VERSION))
    } catch {
      /* storage unavailable */
    }
    setSeenProviderNewsVersion(PROVIDER_NEWS_VERSION)
  }

  async function handleLogoutClick(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault()
    setMobileNavOpen(false)
    navigate('/', { replace: true })
    await onLogout()
  }

  useEffect(() => {
    document.body.classList.add('page-dashboard')
    return () => document.body.classList.remove('page-dashboard')
  }, [])

  return (
    <div className="dashboard-page page-dashboard">
      <header className={`dashboard-page-header${mobileNavOpen ? ' landing-header--open' : ''}`}>
        <div className="dashboard-page-header__brand">
          <Link to="/dashboard" className="dashboard-brand dashboard-brand--header" aria-label="KYBBY dashboard">
            <img className="brand-mark__logo" src="/app/static/img/kybby-logo.png" alt="" />
            <span className="brand-mark__text">KYBBY</span>
          </Link>
        </div>
        <div className="dashboard-page-header__actions">
          <div className="dashboard-userbar">
            <div className="dashboard-notify" onMouseEnter={markProviderNewsSeen}>
              <button
                type="button"
                className="dashboard-icon-btn"
                aria-label={hasUnreadProviderNews ? 'Уведомления: есть непрочитанное сообщение о новых нейросетях' : 'Уведомления'}
                onFocus={markProviderNewsSeen}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </svg>
                {hasUnreadProviderNews ? <span className="dashboard-badge" aria-hidden="true" /> : null}
              </button>
              <div className="dashboard-notify-popover" role="region" aria-label="Сообщения о нейросетях">
                {PROVIDER_NEWS_ENTRIES.map((entry, index) => (
                  <div className="dashboard-notify-item" key={index}>
                    <strong className="dashboard-notify-item__title">{entry.title}</strong>
                    <p className="dashboard-notify-item__body">{entry.body}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="dashboard-userpill">
              <span className="dashboard-userpill__email">{userEmail}</span>
              <span className="dashboard-userpill__avatar">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="dashboard-userpill__avatar-img" width={28} height={28} />
                ) : (
                  <span className="dashboard-userpill__initial">{userInitial}</span>
                )}
              </span>
            </div>
            <button
              type="button"
              className="landing-header__burger"
              aria-expanded={mobileNavOpen}
              aria-controls="dashboard-mobile-nav"
              aria-label={mobileNavOpen ? 'Закрыть меню навигации' : 'Открыть меню навигации'}
              onClick={() => setMobileNavOpen((open) => !open)}
            >
              <span className="landing-header__burger-lines" aria-hidden="true">
                <span className="landing-header__burger-line" />
                <span className="landing-header__burger-line" />
                <span className="landing-header__burger-line" />
              </span>
            </button>
          </div>
        </div>
      </header>
      {mobileNavOpen ? (
        <>
          <button type="button" className="dashboard-mobile-nav-overlay" aria-label="Закрыть меню" onClick={() => setMobileNavOpen(false)} />
          <div className="dashboard-mobile-nav-panel" role="dialog" aria-modal="true" aria-label="Меню навигации">
            <DashboardShellNav
              activePath={activePath}
              mobileNavId="dashboard-mobile-nav"
              className="dashboard-mobile-nav-panel__nav"
              onItemNavigate={() => setMobileNavOpen(false)}
              onLogoutClick={handleLogoutClick}
            />
          </div>
        </>
      ) : null}
      <div className="dashboard-shell">
        <aside className="dashboard-sidebar" aria-label="Боковая панель">
          <DashboardShellNav activePath={activePath} onLogoutClick={handleLogoutClick} />
        </aside>
        <main className={`dashboard-main${mainClassName ? ` ${mainClassName}` : ''}`}>
          {children || <ProjectsDashboard />}
        </main>
      </div>
      <footer className="dashboard-site-footer">
        <div className="dashboard-site-footer__inner">
          <div className="brand-mark brand-mark--dashboard-footer">
            <img className="brand-mark__logo" src="/app/static/img/kybby-logo.png" alt="KYBBY" />
            <span className="brand-mark__text">KYBBY</span>
          </div>
          <p>© 2026 KYBBY. Генерация бренд-комплектов с помощью ИИ.</p>
        </div>
      </footer>
    </div>
  )
}

function GenerationHistoryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialPage = Number(searchParams.get('page') || '1')
  const [history, setHistory] = useState<GenerationHistoryResponse | null>(null)
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([])
  const [statsOpen, setStatsOpen] = useState(false)
  const [errorRow, setErrorRow] = useState<GenerationHistoryRow | null>(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  async function loadHistory(page = initialPage) {
    setIsLoading(true)
    setError('')
    try {
      const payload = await getGenerationHistory(page)
      setHistory(payload)
      setSelectedJobIds([])
      setSearchParams(page > 1 ? { page: String(page) } : {})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить историю генераций.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadHistory(initialPage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!statsOpen && !errorRow) return
    document.body.classList.add('generation-history-modal-open')
    return () => document.body.classList.remove('generation-history-modal-open')
  }, [statsOpen, errorRow])

  const rows = history?.rows || []
  const selectableRows = rows.filter((row) => row.status_key !== 'running')
  const allSelected = selectableRows.length > 0 && selectedJobIds.length === selectableRows.length
  const partiallySelected = selectedJobIds.length > 0 && selectedJobIds.length < selectableRows.length

  function toggleSelectAll(checked: boolean) {
    setSelectedJobIds(checked ? selectableRows.map((row) => row.job_id) : [])
  }

  function toggleRow(jobId: string, checked: boolean) {
    setSelectedJobIds((items) => (
      checked ? [...items, jobId] : items.filter((item) => item !== jobId)
    ))
  }

  async function handleDeleteSelected() {
    if (!selectedJobIds.length) return
    if (!window.confirm(`Удалить выбранные записи (${selectedJobIds.length}) из истории генераций?`)) return

    try {
      await deleteGenerationHistorySelected(selectedJobIds)
      await loadHistory(history?.page || 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить выбранные записи.')
    }
  }

  async function handleCancel(jobId: string) {
    try {
      await cancelGenerationJob(jobId)
      window.setTimeout(() => loadHistory(history?.page || 1), 700)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось прервать генерацию.')
    }
  }

  async function handleRestoreProject(projectSlug: string) {
    setError('')
    try {
      await restoreProject(projectSlug)
      await loadHistory(history?.page || 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось восстановить проект.')
    }
  }

  const historyErrBody = errorRow ? String(errorRow.error_message || '').trim() : ''
  const historyErrHint = errorRow ? String(errorRow.error_hint || '').trim() : ''
  const historyErrShowHint = Boolean(errorRow && historyErrHint && !historyErrBody.includes(historyErrHint))

  return (
    <section className="dashboard-content generation-history-page">
      <div className="dashboard-head generation-history-head">
        <div>
          <div className="generation-history-title-row">
            <h1>История генераций</h1>
            <button type="button" className="generation-history-info-btn" aria-label="Открыть статистику" onClick={() => setStatsOpen(true)}>i</button>
          </div>
          <p className="generation-history-subtitle">Просмотр всех запусков генерации бренд-комплектов</p>
        </div>
      </div>

      <div className="generation-history-table-wrap">
        <p className="generation-history-table-hint">Подсказка: нажмите на статус <strong>Ошибка</strong>, чтобы посмотреть подробности причины.</p>
        {error ? <div className="profile-alert profile-alert--error">{error}</div> : null}

        {isLoading ? (
          <p className="generation-history-empty">Загружаем историю генераций...</p>
        ) : rows.length > 0 ? (
          <>
            <div className="generation-history-bulk-actions">
              <label className="generation-history-select-all">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(node) => {
                    if (node) node.indeterminate = partiallySelected
                  }}
                  onChange={(event) => toggleSelectAll(event.target.checked)}
                />
                <span>Выбрать всё</span>
              </label>
              <div className="generation-history-bulk-actions__buttons">
                <button type="button" className="btn btn-outline btn-inline" disabled={!selectedJobIds.length} onClick={handleDeleteSelected}>Удалить</button>
              </div>
            </div>
            <div className="generation-history-table-scroll">
              <table className="generation-history-table">
                <thead>
                  <tr>
                    <th scope="col" className="generation-history-table__select-col"></th>
                    <th scope="col">Дата</th>
                    <th scope="col">Проект</th>
                    <th scope="col">Статус</th>
                    <th scope="col">Время выполнения</th>
                    <th scope="col">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.job_id}>
                      <td className="generation-history-table__select-col">
                        <input
                          type="checkbox"
                          className="generation-history-row-select"
                          value={row.job_id}
                          disabled={row.status_key === 'running'}
                          title={row.status_key === 'running' ? 'Нельзя удалять активную генерацию' : undefined}
                          checked={selectedJobIds.includes(row.job_id)}
                          onChange={(event) => toggleRow(row.job_id, event.target.checked)}
                        />
                      </td>
                      <td className="generation-history-table__date">{row.started_display}</td>
                      <td className="generation-history-table__project">
                        <span className="generation-history-table__project-inner">
                          <span className="generation-history-project-dot" aria-hidden="true"></span>
                          {row.project_name}
                        </span>
                      </td>
                      <td>{renderHistoryStatus(row, setErrorRow)}</td>
                      <td className="generation-history-table__duration">{row.duration_display}</td>
                      <td className="generation-history-table__actions">{renderHistoryAction(row, handleCancel, handleRestoreProject)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="generation-history-footer">
              <p className="generation-history-footer__meta">
                Показано {history?.showing_from}–{history?.showing_to} из {history?.total} генераций
              </p>
              {(history?.total_pages || 1) > 1 ? (
                <nav className="generation-history-pagination" aria-label="Страницы списка генераций">
                  {history?.has_prev ? (
                    <button type="button" className="btn btn-outline btn-inline generation-history-page-link" onClick={() => loadHistory(history.prev_page)}>Предыдущая</button>
                  ) : (
                    <span className="generation-history-page-link generation-history-page-link--disabled">Предыдущая</span>
                  )}
                  <span className="generation-history-page-current">{history?.page}</span>
                  {history?.has_next ? (
                    <button type="button" className="btn btn-outline btn-inline generation-history-page-link" onClick={() => loadHistory(history.next_page)}>Следующая</button>
                  ) : (
                    <span className="generation-history-page-link generation-history-page-link--disabled">Следующая</span>
                  )}
                </nav>
              ) : null}
            </div>
          </>
        ) : (
          <p className="generation-history-empty">Пока нет записей о генерациях. Запустите генерацию в редакторе проекта.</p>
        )}
      </div>

      {statsOpen && history
        ? dashboardOverlayPortal(
            <div className="generation-history-modal">
          <div className="generation-history-modal__backdrop" onClick={() => setStatsOpen(false)}></div>
          <div className="generation-history-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="generation-history-stats-title">
            <button type="button" className="generation-history-modal__close" aria-label="Закрыть статистику" onClick={() => setStatsOpen(false)}>×</button>
            <h2 id="generation-history-stats-title">Статистика генераций</h2>
            <div className="generation-history-stats generation-history-stats--modal">
              <HistoryStatCard label="Генераций всего" value={String(history.stats.total)} />
              <HistoryStatCard label="Успешных генераций" value={String(history.stats.successful)} />
              <HistoryStatCard label="Среднее время" value={history.stats_avg_display} />
              <HistoryStatCard label="Проектов" value={String(history.stats.projects_with_generations)} />
            </div>
          </div>
        </div>
      ) : null}

      {errorRow ? (
        <div className="generation-history-modal">
          <div className="generation-history-modal__backdrop" onClick={() => setErrorRow(null)}></div>
          <div className="generation-history-modal__dialog" role="alertdialog" aria-modal="true" aria-labelledby="generation-history-error-title">
            <button type="button" className="generation-history-modal__close" aria-label="Закрыть" onClick={() => setErrorRow(null)}>×</button>
            <h2 id="generation-history-error-title">Ошибка генерации</h2>
            <p className="generation-history-error-body">
              {historyErrBody
                || 'Текст ошибки не был сохранён (часто так бывает у старых записей или после сбоя). Откройте проект и при необходимости запустите генерацию снова.'}
            </p>
            {historyErrShowHint ? <p className="generation-history-error-hint">{historyErrHint}</p> : null}
            <div className="generation-history-modal__actions">
              <button type="button" className="btn btn-primary btn-inline" onClick={() => setErrorRow(null)}>Ок</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function renderHistoryStatus(row: GenerationHistoryRow, openError: (row: GenerationHistoryRow) => void) {
  if (row.status_key === 'success') {
    return <span className="generation-history-pill generation-history-pill--success">Успешно</span>
  }
  if (row.status_key === 'running') {
    return <span className="generation-history-pill generation-history-pill--running">В процессе</span>
  }
  return (
    <button
      type="button"
      className="generation-history-pill generation-history-pill--error generation-history-pill-button"
      title="Нажмите, чтобы открыть подробности ошибки"
      onClick={() => openError(row)}
    >
      Ошибка
    </button>
  )
}

function renderHistoryAction(
  row: GenerationHistoryRow,
  cancel: (jobId: string) => void,
  restoreProjectSlug: (slug: string) => void,
) {
  if (row.action === 'cancel') {
    return (
      <button type="button" className="btn btn-outline btn-inline generation-history-action-btn generation-history-btn-cancel" onClick={() => cancel(row.job_id)}>
        Прервать
      </button>
    )
  }
  if (row.action === 'open') {
    return <Link className="btn btn-primary btn-inline generation-history-action-btn" to={`/projects/${row.project_slug}/results?job=${encodeURIComponent(row.job_id)}`}>Открыть</Link>
  }
  if (row.action === 'restore') {
    return (
      <button
        type="button"
        className="btn btn-inline generation-history-action-btn generation-history-btn-restore"
        onClick={() => restoreProjectSlug(row.project_slug)}
      >
        Восстановить
      </button>
    )
  }
  return <Link className="btn btn-outline btn-inline generation-history-action-btn generation-history-btn-repeat" to={`/projects/${row.project_slug}`}>Повторить</Link>
}

function HistoryStatCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="generation-history-stat-card">
      <div className="generation-history-stat-card__icon" aria-hidden="true">•</div>
      <div className="generation-history-stat-card__body">
        <span className="generation-history-stat-card__label">{label}</span>
        <strong className="generation-history-stat-card__value">{value}</strong>
      </div>
    </article>
  )
}

function resolveAppPublicUrl(path: string): string {
  if (!path) return ''
  if (/^https?:\/\//i.test(path)) return path
  if (typeof window === 'undefined') return path
  return `${window.location.origin}${path.startsWith('/') ? path : `/${path}`}`
}

function ResultsFigmaImportGuide({ brandId }: { brandId: string }) {
  const [brandCopyHint, setBrandCopyHint] = useState('')
  const [addressCopyHint, setAddressCopyHint] = useState('')
  const kybbAddress = typeof window !== 'undefined' ? window.location.origin : ''

  async function copyBrandId() {
    try {
      await navigator.clipboard.writeText(brandId)
      setBrandCopyHint('Скопировано')
      window.setTimeout(() => setBrandCopyHint(''), 2000)
    } catch {
      setBrandCopyHint('Не удалось скопировать')
    }
  }

  async function copyKybbAddress() {
    try {
      await navigator.clipboard.writeText(kybbAddress)
      setAddressCopyHint('Скопировано')
      window.setTimeout(() => setAddressCopyHint(''), 2000)
    } catch {
      setAddressCopyHint('Не удалось скопировать')
    }
  }

  return (
    <div className="results-figma-guide">
      <p className="results-figma-guide__lead">
        Для переноса в Figma сначала установите плагин KYBBY —{' '}
        <Link to="/figma-plugin">инструкция в разделе «Figma-плагин»</Link>.
      </p>
      <dl className="results-figma-guide__params">
        <div className="results-figma-guide__param">
          <dt>Brand ID этого проекта</dt>
          <dd>
            <div className="results-figma-guide__copy-field">
              <code className="results-figma-guide__copy-field-value">{brandId}</code>
              <button
                type="button"
                className="results-figma-guide__copy-btn"
                aria-label="Копировать Brand ID"
                title="Копировать"
                onClick={() => void copyBrandId()}
              >
                <CopyIcon />
              </button>
            </div>
            {brandCopyHint ? <span className="results-figma-guide__copy-hint">{brandCopyHint}</span> : null}
          </dd>
        </div>
        <div className="results-figma-guide__param">
          <dt>Адрес KYBBY</dt>
          <dd>
            <div className="results-figma-guide__copy-field">
              <code className="results-figma-guide__copy-field-value">{kybbAddress}</code>
              <button
                type="button"
                className="results-figma-guide__copy-btn"
                aria-label="Копировать адрес KYBBY"
                title="Копировать"
                onClick={() => void copyKybbAddress()}
              >
                <CopyIcon />
              </button>
            </div>
            {addressCopyHint ? <span className="results-figma-guide__copy-hint">{addressCopyHint}</span> : null}
          </dd>
        </div>
      </dl>
      <ol className="results-figma-guide__steps">
        <li>Нажмите «Экспорт бренд-комплекта» на этой странице.</li>
        <li>Откройте плагин KYBBY в Figma и вставьте Brand ID и адрес KYBBY.</li>
        <li>Выберите провайдера и нажмите Import.</li>
      </ol>
    </div>
  )
}

function ResultsPage({ projectSlug }: { projectSlug: string }) {
  const [searchParams] = useSearchParams()
  const selectedJobId = searchParams.get('job')?.trim() || ''
  const [results, setResults] = useState<ProjectResultsResponse | null>(null)
  const [job, setJob] = useState<GenerationJob | null>(null)
  const [manifestUrl, setManifestUrl] = useState('')
  const [exportStatus, setExportStatus] = useState('')
  const [exportTone, setExportTone] = useState<'loading' | 'success' | 'error' | ''>('')
  const [isExporting, setIsExporting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [cancelRequested, setCancelRequested] = useState(false)

  useEffect(() => {
    let alive = true
    setIsLoading(true)
    setError('')
    setJob(null)

    getProjectResults(projectSlug, selectedJobId)
      .then((payload) => {
        if (!alive) return
        setResults(payload)
        setIsLoading(false)

        const activeJobId = payload.active_generation_job_id
        if (activeJobId) {
          void pollResultsJob(activeJobId)
          return
        }

        void getActiveGenerationJob(projectSlug)
          .then((active) => {
            if (alive && active?.job?.id) {
              void pollResultsJob(active.job.id)
            }
          })
          .catch(() => null)
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : 'Не удалось загрузить результаты генерации.')
        if (alive) setIsLoading(false)
      })

    async function pollResultsJob(jobId: string) {
      setCancelRequested(false)
      while (alive) {
        const payload = await getGenerationJob(jobId).catch(() => null)
        if (!payload?.ok || !payload.job) break
        setJob(payload.job)
        const terminal = ['completed', 'failed', 'cancelled', 'completed_with_errors'].includes(String(payload.job.status || ''))
        if (terminal) break
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }

    return () => {
      alive = false
    }
  }, [projectSlug, selectedJobId])

  async function handleGenerateFigma() {
    if (!results) return
    const jobIdForExport = results.selected_generation_job_id?.trim() || ''
    setManifestUrl('')
    setIsExporting(true)
    setExportStatus(jobIdForExport ? 'Подготовка manifest для выбранной версии…' : 'Подготовка manifest…')
    setExportTone('loading')

    try {
      const payload = await generateFigmaManifest(projectSlug, results.project.brand_id, jobIdForExport || undefined)
      setManifestUrl(payload.download_url || payload.manifest_url || '')
      setExportStatus('Экспорт готов. Скопируйте Brand ID и импортируйте проект через плагин Figma.')
      setExportTone('success')
      window.setTimeout(() => setIsExporting(false), 1600)
    } catch (err) {
      setExportStatus(err instanceof Error ? err.message : 'Не удалось подготовить Figma manifest.')
      setExportTone('error')
      setIsExporting(false)
    }
  }

  async function handleCancelGeneration() {
    if (!job?.id || cancelRequested) return
    setCancelRequested(true)
    try {
      await cancelResultsGenerationJob(job.id)
      setJob({ ...job, message: 'Прерывание генерации...' })
    } catch {
      setCancelRequested(false)
    }
  }

  if (isLoading) {
    return (
      <section className="results-page">
        <div className="results-page__head">
          <div>
            <h1>Результаты генерации бренд-комплекта</h1>
            <p>Загружаем результаты...</p>
          </div>
        </div>
      </section>
    )
  }

  if (error || !results) {
    return (
      <section className="results-page">
        <div className="results-page__head">
          <div>
            <h1>Результаты генерации бренд-комплекта</h1>
            <p>{error || 'Результаты пока недоступны.'}</p>
          </div>
        </div>
      </section>
    )
  }

  const hasResultsContent =
    results.palette_items.length > 0 ||
    results.assets.logos.length > 0 ||
    results.assets.icons.length > 0 ||
    results.assets.patterns.length > 0 ||
    results.assets.illustrations.length > 0

  return (
    <>
      <section className="results-page" data-results-page data-project-slug={projectSlug} data-brand-id={results.project.brand_id} data-active-job-id={job?.id || ''}>
        <div className="results-page__head">
          <div>
            <h1>Результаты генерации бренд-комплекта</h1>
            <p>
              {results.selected_generation_job_id
                ? 'Открыта сохранённая версия генерации из истории'
                : hasResultsContent
                  ? 'Ваш бренд-комплект готов к использованию'
                  : 'Здесь появятся результаты после первой успешной генерации в редакторе проекта.'}
            </p>
          </div>
        </div>

        <div className="results-stack">
          <section className="results-card">
            <div className="results-card__head">
              <div className="results-card__title">
                <h2>Цветовая палитра</h2>
              </div>
            </div>
            {results.palette_items.length ? (
              <div className="palette-results-grid">
                {results.palette_items.map((item) => (
                  <div className="palette-results-item" key={item.key}>
                    <div className="palette-results-item__swatch" style={{ background: item.value }}></div>
                    <div className="palette-results-item__label">{item.label}</div>
                    <div className="palette-results-item__value">{item.value}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="results-empty">Палитра пока недоступна.</div>
            )}
          </section>

          <ResultsAssetSection title="Логотипы" kind="logos" projectSlug={projectSlug} selectedJobId={results.selected_generation_job_id || ''} assets={results.assets.logos} gridClassName="results-icons-grid" cardClassName="results-icon-card" showDownloadButton={hasResultsContent} />
          <ResultsAssetSection title="Иконки" kind="icons" projectSlug={projectSlug} selectedJobId={results.selected_generation_job_id || ''} assets={results.assets.icons} gridClassName="results-icons-grid" cardClassName="results-icon-card" showDownloadButton={hasResultsContent} />
          <ResultsAssetSection title="Паттерны" kind="patterns" projectSlug={projectSlug} selectedJobId={results.selected_generation_job_id || ''} assets={results.assets.patterns} gridClassName="results-media-grid results-media-grid--patterns" cardClassName="results-media-card" showDownloadButton={hasResultsContent} />
          <ResultsAssetSection title="Иллюстрации" kind="illustrations" projectSlug={projectSlug} selectedJobId={results.selected_generation_job_id || ''} assets={results.assets.illustrations} gridClassName="results-media-grid" cardClassName="results-media-card" showDownloadButton={hasResultsContent} />

          {hasResultsContent ? <BrandMockupsPreview results={results} /> : null}

          {hasResultsContent ? (
          <section className="results-card results-card--export" data-figma-export>
            <div className="results-card__head results-card__head--stacked">
              <div className="results-card__title">
                <h2>Экспорт в Figma</h2>
              </div>
            </div>
            <ResultsFigmaImportGuide brandId={results.project.brand_id} />
            {manifestUrl ? (
              <details className="results-manifest" id="results-manifest-panel">
                <summary className="results-manifest__summary">
                  <span>Скачать JSON manifest</span>
                </summary>
                <div className="results-manifest__content">
                  <a href={resolveAppPublicUrl(manifestUrl)} className="btn results-manifest__download-link" download>
                    Скачать файл manifest
                  </a>
                </div>
              </details>
            ) : null}
            <div className="results-export__actions">
              <button type="button" className="btn btn-primary" disabled={isExporting} onClick={handleGenerateFigma}>
                {isExporting ? 'Генерируем Figma JSON…' : manifestUrl ? 'Manifest готов ✓' : 'Экспорт бренд-комплекта'}
              </button>
              <a href={`/projects/${projectSlug}/downloads/all${results.selected_generation_job_id ? `?job=${encodeURIComponent(results.selected_generation_job_id)}` : ''}`} className="btn btn-secondary">Скачать архив</a>
            </div>
            <p className={`results-export__status${exportTone ? ` results-export__status--${exportTone}` : ''}`} aria-live="polite">{exportStatus}</p>
          </section>
          ) : null}
        </div>
      </section>

      {job ? <ResultsGenerationModal job={job} cancelRequested={cancelRequested} onCancel={handleCancelGeneration} onClose={() => setJob(null)} /> : null}
    </>
  )
}

function ResultsAssetSection({
  title,
  kind,
  projectSlug,
  selectedJobId,
  assets,
  gridClassName,
  cardClassName,
  showDownloadButton,
}: {
  title: string
  kind: 'logos' | 'icons' | 'patterns' | 'illustrations'
  projectSlug: string
  selectedJobId: string
  assets: ResultAsset[]
  gridClassName: string
  cardClassName: string
  showDownloadButton: boolean
}) {
  const downloadUrl = `/projects/${projectSlug}/downloads/${kind}${selectedJobId ? `?job=${encodeURIComponent(selectedJobId)}` : ''}`
  return (
    <section className="results-card" key={`${kind}-${selectedJobId || 'current'}`}>
      <div className="results-card__head">
        <div className="results-card__title">
          <h2>{title}</h2>
        </div>
        {showDownloadButton ? <a href={downloadUrl} className="btn btn-primary btn-inline">Скачать</a> : null}
      </div>
      {assets.length ? (
        <div className={gridClassName}>
          {assets.map((asset) => (
            <a href={asset.url} target="_blank" rel="noopener" className={cardClassName} title={`${asset.provider} / ${asset.name}`} key={`${selectedJobId || 'current'}-${asset.provider}-${asset.filename}-${asset.url}`}>
              <img src={asset.url} alt={asset.name} />
            </a>
          ))}
        </div>
      ) : (
        <div className="results-empty">{title} пока не найдены.</div>
      )}
    </section>
  )
}

function isGenerationLogErrorLine(line: string): boolean {
  const withoutTime = line.replace(/^\[[^\]]+\]\s*/, '').trim()
  const s = withoutTime.toLowerCase()
  if (!s) return false
  const markers = [
    'insufficient credits',
    'insufficient balance',
    'out of credits',
    'payment required',
    'billing',
    'rate limit',
    'too many requests',
    'quota exceeded',
    'error:',
    '[error]',
    ' failed',
    'failed:',
    'failure',
    'exception',
    'traceback',
    'http 401',
    'http 403',
    'http 429',
    'http 500',
    'http 502',
    'http 503',
    'econnrefused',
    'etimedout',
    'timeout',
    'unauthorized',
    'forbidden',
    'invalid api key',
    'api key invalid',
    'openrouter.ai',
    'ошибка',
    'сбой',
    'подсказка:',
    'не удалось',
    'недостаточно средств',
    'недостаточно',
    'отказано',
    'превышено время',
    'недоступен',
    'завершена с ошибками',
  ]
  return markers.some((m) => s.includes(m))
}

function GenerationLogView({ logs }: { logs: string[] | undefined }) {
  const lines = Array.isArray(logs) ? logs : []
  return (
    <pre className="generation-log">
      {lines.map((line, i) => (
        <span
          key={i}
          className={isGenerationLogErrorLine(line) ? 'generation-log__line generation-log__line--error' : 'generation-log__line'}
        >
          {line}
          {i < lines.length - 1 ? '\n' : ''}
        </span>
      ))}
    </pre>
  )
}

function dashboardOverlayPortal(content: ReactNode) {
  if (typeof document === 'undefined') return null
  return createPortal(content, document.body)
}

function AppConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Ок',
  cancelLabel = 'Отмена',
  isBusy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title?: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  isBusy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  useEffect(() => {
    if (!open) return
    document.body.classList.add('modal-open')
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isBusy) onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.classList.remove('modal-open')
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, isBusy, onCancel])

  if (!open) return null

  return dashboardOverlayPortal(
    <div className="app-confirm-modal" role="presentation">
      <button type="button" className="app-confirm-modal__backdrop" aria-label="Закрыть" disabled={isBusy} onClick={onCancel} />
      <div
        className={`app-confirm-modal__dialog${title ? '' : ' app-confirm-modal__dialog--message-only'}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={title ? 'app-confirm-modal-title' : 'app-confirm-modal-message'}
        aria-describedby={title ? 'app-confirm-modal-message' : undefined}
      >
        <button type="button" className="app-confirm-modal__close" aria-label="Закрыть" disabled={isBusy} onClick={onCancel}>
          ×
        </button>
        {title ? (
          <h2 className="app-confirm-modal__title" id="app-confirm-modal-title">
            {title}
          </h2>
        ) : null}
        <p className="app-confirm-modal__message" id="app-confirm-modal-message">
          {message}
        </p>
        <div className="app-confirm-modal__actions">
          <button type="button" className="btn btn-outline btn-inline app-confirm-modal__cancel" disabled={isBusy} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="btn btn-primary btn-inline" disabled={isBusy} onClick={onConfirm}>
            {isBusy ? 'Подождите...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
  )
}

function ResultsGenerationModal({
  job,
  cancelRequested,
  onCancel,
  onClose,
}: {
  job: GenerationJob
  cancelRequested: boolean
  onCancel: () => void
  onClose: () => void
}) {
  const terminal = ['completed', 'failed', 'cancelled', 'completed_with_errors'].includes(String(job.status || ''))
  const statuses = job.provider_statuses || job.providers || {}

  useEffect(() => {
    document.body.classList.add('modal-open')
    return () => document.body.classList.remove('modal-open')
  }, [])

  return dashboardOverlayPortal(
    <div className="generation-modal">
      <div className="generation-modal__backdrop"></div>
      <div className="generation-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="results-generation-modal-title">
        <button type="button" className="generation-modal__close" hidden={!terminal} onClick={onClose}>×</button>
        <h2 id="results-generation-modal-title">Генерация бренд-комплекта</h2>
        <div className="generation-progress">
          <div className="generation-progress__bar" style={{ width: `${Number(job.progress || 0)}%` }}></div>
        </div>
        <div className="generation-status-row">
          <strong>{Number(job.progress || 0)}%</strong>
          <span className="generation-status-text">{terminal && job.status === 'cancelled' ? 'Генерация прервана' : job.message || 'Выполняется'}</span>
        </div>
        <ProviderStatusRail statuses={statuses} />
        <label className="generation-log-label">Лог операций</label>
        <GenerationLogView logs={job.logs} />
        <div className="generation-modal__actions">
          {!terminal ? (
            <button type="button" className="btn btn-outline btn-inline" disabled={cancelRequested} onClick={onCancel}>
              {cancelRequested ? 'Прерываем...' : 'Прервать генерацию'}
            </button>
          ) : null}
        </div>
      </div>
    </div>,
  )
}

function normalizeProviderStatus(status: string | undefined): string {
  const normalized = String(status || '')
  return ['pending', 'running', 'success', 'error', 'skipped'].includes(normalized) ? normalized : 'pending'
}

function providerStatusLabel(status: string | undefined) {
  const normalized = normalizeProviderStatus(status)
  if (normalized === 'running') return 'выполняется'
  if (normalized === 'success') return 'успех'
  if (normalized === 'error') return 'ошибка'
  if (normalized === 'skipped') return 'пропущен'
  return 'ожидание'
}

function activeProviderSlug(statuses: Record<string, string | undefined>) {
  const entries = generationProviderEntries(statuses)
  const running = entries.find((provider) => normalizeProviderStatus(statuses[provider.slug]) === 'running')
  if (running) return running.slug

  const lastResolvedIndex = entries.reduce((lastIndex, provider, index) => {
    const status = normalizeProviderStatus(statuses[provider.slug])
    return status === 'success' || status === 'error' || status === 'skipped' ? index : lastIndex
  }, -1)
  const nextPending = entries.slice(lastResolvedIndex + 1).find((provider) => normalizeProviderStatus(statuses[provider.slug]) === 'pending')
  return nextPending?.slug || entries[Math.max(0, lastResolvedIndex)]?.slug || entries[0]?.slug || ''
}

function ProviderStatusRail({ statuses }: { statuses: Record<string, string | undefined> }) {
  const providers = generationProviderEntries(statuses)
  const activeSlug = activeProviderSlug(statuses)
  const statusSignature = providers.map((provider) => `${provider.slug}:${normalizeProviderStatus(statuses[provider.slug])}`).join('|')
  const railRef = useRef<HTMLDivElement | null>(null)
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useLayoutEffect(() => {
    const rail = railRef.current
    const activeItem = itemRefs.current[activeSlug]
    if (!rail || !activeItem) return

    const frameId = window.requestAnimationFrame(() => {
      const targetLeft = activeItem.offsetLeft - (rail.clientWidth - activeItem.clientWidth) / 2
      const maxLeft = Math.max(0, rail.scrollWidth - rail.clientWidth)
      rail.scrollTo({
        left: Math.min(Math.max(0, targetLeft), maxLeft),
        behavior: 'smooth',
      })
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [activeSlug, statusSignature])

  return (
    <div className="generation-providers" ref={railRef} aria-label="Статусы AI-провайдеров">
      {providers.map((provider) => {
        const normalizedStatus = normalizeProviderStatus(statuses[provider.slug])
        return (
          <div
            className={`generation-provider${provider.slug === activeSlug ? ' generation-provider--active' : ''}`}
            key={provider.slug}
            ref={(node) => {
              itemRefs.current[provider.slug] = node
            }}
          >
            <span>{provider.label}</span>
            <span className={`provider-pill provider-pill--${normalizedStatus}`}>
              {providerStatusLabel(statuses[provider.slug])}
            </span>
          </div>
        )
      })}
    </div>
  )
}

const PALETTE_KEYS = ['primary', 'secondary', 'accent', 'tertiary', 'neutral', 'extra'] as const
type PaletteKey = (typeof PALETTE_KEYS)[number]

const PALETTE_LABELS: Record<PaletteKey, string> = {
  primary: 'Primary',
  secondary: 'Secondary',
  accent: 'Accent',
  tertiary: 'Tertiary',
  neutral: 'Neutral',
  extra: 'Extra',
}

const DEFAULT_PALETTE: Record<PaletteKey, string> = {
  primary: '#E5A50A',
  secondary: '#C64600',
  accent: '#613583',
  tertiary: '#5E81AC',
  neutral: '#D8DEE9',
  extra: '#2E3440',
}

const ASSET_TYPES = ['logos', 'icons', 'patterns', 'illustrations'] as const
type AssetType = (typeof ASSET_TYPES)[number]

type StyleRef = {
  path: string
  name: string
  url: string
}

const ASSET_LABELS: Record<AssetType, string> = {
  logos: 'Логотип',
  icons: 'Иконки',
  patterns: 'Паттерны',
  illustrations: 'Иллюстрации',
}

const ASSET_PLACEHOLDERS: Record<AssetType, string> = {
  logos: 'Опишите, какой логотип вам нужен…',
  icons: 'Опишите, какие иконки или образы ожидаете…',
  patterns: 'Опишите, каким должен быть паттерн…',
  illustrations: 'Опишите, какую иллюстрацию хотите получить…',
}

const ASSET_REF_LABELS: Record<AssetType, string> = {
  logos: 'Референсы для логотипа',
  icons: 'Референсы для иконок',
  patterns: 'Референсы для паттернов',
  illustrations: 'Референсы для иллюстраций',
}

const DEFAULT_ASSET_COUNTS: Record<AssetType, number> = {
  logos: 4,
  icons: 8,
  patterns: 4,
  illustrations: 4,
}

function illustrationFormatFromTokens(tokens: ProjectTokens): 'vector' | 'raster' {
  const vector = getNestedTokenBoolean(tokens, 'illustration', 'vector', false)
  const raster = getNestedTokenBoolean(tokens, 'illustration', 'raster', true)
  if (vector && !raster) return 'vector'
  return 'raster'
}

function ProjectEditorPage({ projectSlug, isNewProjectFlow }: { projectSlug: string; isNewProjectFlow: boolean }) {
  const [editor, setEditor] = useState<ProjectEditorResponse | null>(null)
  const [tokens, setTokens] = useState<ProjectTokens>({})
  const [name, setName] = useState('')
  const [brandDescription, setBrandDescription] = useState('')
  const [brandId, setBrandId] = useState('')
  const [styleId, setStyleId] = useState('')
  const [paletteSlots, setPaletteSlots] = useState<Record<PaletteKey, string>>(DEFAULT_PALETTE)
  const [activePaletteKeys, setActivePaletteKeys] = useState<PaletteKey[]>(['primary', 'secondary', 'accent'])
  const [paletteSeedRole, setPaletteSeedRole] = useState<PaletteKey>('primary')
  const [paletteSeedColor, setPaletteSeedColor] = useState(DEFAULT_PALETTE.primary)
  const [paletteSuggestions, setPaletteSuggestions] = useState<Record<PaletteVariantName, PaletteVariant> | null>(null)
  const [activePaletteVariant, setActivePaletteVariant] = useState<PaletteVariantName>('balanced')
  const [isPaletteLoading, setIsPaletteLoading] = useState(false)
  const [paletteAssistantOpen, setPaletteAssistantOpen] = useState(false)
  const [activeAssetType, setActiveAssetType] = useState<AssetType>('logos')
  const [promptFields, setPromptFields] = useState<Record<AssetType, string>>({
    logos: '',
    icons: '',
    patterns: '',
    illustrations: '',
  })
  const [assetCounts, setAssetCounts] = useState<Record<AssetType, number>>(DEFAULT_ASSET_COUNTS)
  const [iconStrokeWidth, setIconStrokeWidth] = useState(2)
  const [iconCorner, setIconCorner] = useState('rounded')
  const [iconFill, setIconFill] = useState('outline')
  const [illustrationFormat, setIllustrationFormat] = useState<'vector' | 'raster'>('raster')
  const [assetRefs, setAssetRefs] = useState<Record<AssetType, StyleRef[]>>(() => ({
    logos: [],
    icons: [],
    patterns: [],
    illustrations: [],
  }))
  const [refsLoadingType, setRefsLoadingType] = useState<AssetType | null>(null)
  const [buildStyle, setBuildStyle] = useState(true)
  const [selectedGenerationProviders, setSelectedGenerationProviders] = useState<string[]>(() => [...GENERATION_PROVIDERS.map((p) => p.slug)])
  const [generationJob, setGenerationJob] = useState<GenerationJob | null>(null)
  const [isGenerationModalOpen, setIsGenerationModalOpen] = useState(false)
  const [generationError, setGenerationError] = useState('')
  const [generationErrorHint, setGenerationErrorHint] = useState('')
  const [isGenerationStarting, setIsGenerationStarting] = useState(false)
  const [cancelRequested, setCancelRequested] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const key = `kybby_import_warnings:${projectSlug}`
    const stored = sessionStorage.getItem(key)
    if (!stored) return
    sessionStorage.removeItem(key)
    setStatus(`Проект импортирован с предупреждениями: ${stored}`)
  }, [projectSlug])

  useEffect(() => {
    let alive = true
    setIsLoading(true)
    setError('')

    getProjectEditor(projectSlug, isNewProjectFlow)
      .then((payload) => {
        if (!alive) return
        setEditor(payload)
        hydrateEditorState(payload.tokens)
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : 'Не удалось загрузить проект.')
      })
      .finally(() => {
        if (alive) setIsLoading(false)
      })

    function hydrateEditorState(nextTokens: ProjectTokens) {
      setTokens(nextTokens)
      setName(getTokenString(nextTokens, 'name'))
      setBrandDescription(getTokenString(nextTokens, 'brand_description'))
      setBrandId(getTokenString(nextTokens, 'brand_id'))
      setStyleId(getTokenString(nextTokens, 'style_id'))
      const nextPaletteSlots = getPaletteSlots(nextTokens)
      setPaletteSlots(nextPaletteSlots)
      setActivePaletteKeys(getActivePaletteKeys(nextTokens))
      setPaletteSeedRole('primary')
      setPaletteSeedColor(normalizeHexColor(nextPaletteSlots.primary) || DEFAULT_PALETTE.primary)
      setPaletteSuggestions(null)
      setPaletteAssistantOpen(false)
      setActivePaletteVariant('balanced')
      setPromptFields(tokensToPromptFields(nextTokens))
      setAssetCounts(getAssetCounts(nextTokens))
      setIconStrokeWidth(getNestedTokenNumber(nextTokens, 'icon', 'strokeWidth', 2))
      setIconCorner(getNestedTokenString(nextTokens, 'icon', 'corner', 'rounded'))
      setIconFill(getNestedTokenString(nextTokens, 'icon', 'fill', 'outline'))
      setIllustrationFormat(illustrationFormatFromTokens(nextTokens))
      setAssetRefs(referencesToAssetRefs(nextTokens, projectSlug))
      setBuildStyle(getNestedTokenBoolean(nextTokens, 'generation', 'build_style', true))
      setSelectedGenerationProviders(getGenerationProviderSlugsFromTokens(nextTokens))
    }

    return () => {
      alive = false
    }
  }, [projectSlug, isNewProjectFlow])

  function setPaletteValue(key: PaletteKey, value: string) {
    const nextColor = value.toUpperCase()
    setPaletteSlots((current) => ({ ...current, [key]: nextColor }))
    const normalized = normalizeHexColor(nextColor)
    if (normalized) {
      setPaletteSeedRole(key)
      setPaletteSeedColor(normalized)
      setPaletteSuggestions(null)
    }
  }

  async function fetchPaletteSuggestions(seedRole = paletteSeedRole, seedColor = paletteSeedColor) {
    const normalized = normalizeHexColor(seedColor)
    if (!normalized) return
    setIsPaletteLoading(true)
    try {
      const payload = await suggestProjectPalette(projectSlug, normalized, seedRole)
      setPaletteSuggestions(payload.variants)
      setPaletteSeedRole(payload.seed_role)
      setPaletteSeedColor(payload.seed_color)
      setActivePaletteVariant(payload.variants.balanced ? 'balanced' : 'soft')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось подобрать палитру.')
    } finally {
      setIsPaletteLoading(false)
    }
  }

  async function applySuggestedPalette(variantName: PaletteVariantName) {
    let suggestions = paletteSuggestions
    if (!suggestions) {
      const normalized = normalizeHexColor(paletteSeedColor)
      if (!normalized) return
      const payload = await suggestProjectPalette(projectSlug, normalized, paletteSeedRole)
      suggestions = payload.variants
      setPaletteSuggestions(payload.variants)
      setPaletteSeedRole(payload.seed_role)
      setPaletteSeedColor(payload.seed_color)
    }

    const variant = suggestions[variantName]
    if (!variant) return
    setActivePaletteVariant(variantName)
    setPaletteSlots(PALETTE_KEYS.reduce<Record<PaletteKey, string>>((acc, key) => {
      acc[key] = normalizeHexColor(variant[key]) || DEFAULT_PALETTE[key]
      return acc
    }, { ...DEFAULT_PALETTE }))
    setActivePaletteKeys((current) => current.includes(paletteSeedRole) ? current : [...current, paletteSeedRole].slice(0, 6))
  }

  function togglePaletteKey(key: PaletteKey, checked: boolean) {
    setActivePaletteKeys((current) => {
      if (checked) return current.includes(key) ? current : [...current, key].slice(0, 6)
      if (current.length <= 2) return current
      return current.filter((item) => item !== key)
    })
  }

  function setAssetCount(type: AssetType, value: string) {
    setAssetCounts((current) => ({ ...current, [type]: clampAssetCount(value, DEFAULT_ASSET_COUNTS[type]) }))
  }

  function syncAssetRefs(nextRefs: Record<AssetType, StyleRef[]>) {
    const styleImages = ASSET_TYPES.flatMap((type) => nextRefs[type].map((ref) => ref.path))
    setAssetRefs(nextRefs)
    setTokens((current) => ({
      ...current,
      references: {
        ...getTokenRecord(current, 'references'),
        ...ASSET_TYPES.reduce<Record<AssetType, string[]>>((acc, type) => {
          acc[type] = nextRefs[type].map((ref) => ref.path)
          return acc
        }, {} as Record<AssetType, string[]>),
        style_images: styleImages,
      },
    }))
  }

  function applyReferencesResponse(payload: { references?: Record<AssetType, string[]> }) {
    if (!payload.references) return
    syncAssetRefs(
      ASSET_TYPES.reduce<Record<AssetType, StyleRef[]>>((acc, type) => {
        acc[type] = normalizeStyleRefs(payload.references?.[type], projectSlug)
        return acc
      }, {
        logos: [],
        icons: [],
        patterns: [],
        illustrations: [],
      }),
    )
  }

  async function handleUploadRefs(assetType: AssetType, files: FileList | null) {
    if (!files?.length) return
    setRefsLoadingType(assetType)
    setStatus('')
    setError('')

    try {
      const payload = await uploadProjectEditorRefs(projectSlug, files, assetType)
      applyReferencesResponse(payload)
      setStatus('Референсы загружены.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить референсы.')
    } finally {
      setRefsLoadingType(null)
    }
  }

  async function handleDeleteRef(assetType: AssetType, path: string) {
    setRefsLoadingType(assetType)
    setStatus('')
    setError('')

    try {
      const payload = await deleteProjectEditorRef(projectSlug, path, assetType)
      applyReferencesResponse(payload)
      setStatus('Референс удалён.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить референс.')
    } finally {
      setRefsLoadingType(null)
    }
  }

  function buildEditorPayload(): ProjectTokens {
    const next = structuredClone(tokens) as ProjectTokens
    next.name = name.trim()
    next.brand_description = brandDescription.trim().slice(0, 500)
    next.brand_id = brandId.trim()
    next.style_id = styleId.trim()

    const palette = activePaletteKeys.reduce<Record<string, string>>((acc, key) => {
      acc[key] = normalizeHexColor(paletteSlots[key]) || DEFAULT_PALETTE[key]
      return acc
    }, {})

    next.palette_slots = PALETTE_KEYS.reduce<Record<string, string>>((acc, key) => {
      acc[key] = normalizeHexColor(paletteSlots[key]) || DEFAULT_PALETTE[key]
      return acc
    }, {})
    next.palette = palette
    next.generation = {
      ...getTokenRecord(next, 'generation'),
      active_palette_keys: activePaletteKeys,
      logos_count: assetCounts.logos,
      icons_count: assetCounts.icons,
      patterns_count: assetCounts.patterns,
      illustrations_count: assetCounts.illustrations,
      build_style: buildStyle,
      provider_slugs: [...selectedGenerationProviders],
    }
    next.icon = {
      ...getTokenRecord(next, 'icon'),
      strokeWidth: iconStrokeWidth,
      corner: iconCorner,
      fill: iconFill,
    }
    next.illustration = {
      ...getTokenRecord(next, 'illustration'),
      vector: illustrationFormat === 'vector',
      raster: illustrationFormat === 'raster',
    }
    next.prompts = {
      ...getTokenRecord(next, 'prompts'),
      logos: expandPromptFieldForCount(promptFields.logos, assetCounts.logos),
      icons: expandPromptFieldForCount(promptFields.icons, assetCounts.icons),
      patterns: expandPromptFieldForCount(promptFields.patterns, assetCounts.patterns),
      illustrations: expandPromptFieldForCount(promptFields.illustrations, assetCounts.illustrations),
    }
    next.references = {
      ...getTokenRecord(next, 'references'),
      ...ASSET_TYPES.reduce<Record<AssetType, string[]>>((acc, type) => {
        acc[type] = assetRefs[type].map((ref) => ref.path)
        return acc
      }, {} as Record<AssetType, string[]>),
    }

    return next
  }

  async function handleSave() {
    setIsSaving(true)
    setStatus('')
    setError('')

    try {
      const payload = await saveProjectEditor(projectSlug, buildEditorPayload())
      setTokens(payload.tokens)
      setStatus('Проект сохранён.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить проект.')
    } finally {
      setIsSaving(false)
    }
  }

  function toggleGenerationProvider(slug: string, checked: boolean) {
    if (slug === 'recraft' && !checked && buildStyle) {
      setBuildStyle(false)
    }
    setSelectedGenerationProviders((prev) => {
      if (checked) {
        return prev.includes(slug) ? prev : [...prev, slug]
      }
      if (prev.length <= 1) {
        return prev
      }
      return prev.filter((s) => s !== slug)
    })
  }

  async function handleGenerate() {
    setIsGenerationStarting(true)
    setIsGenerationModalOpen(true)
    setGenerationError('')
    setGenerationErrorHint('')
    setCancelRequested(false)
    const initialProviderStatuses = Object.fromEntries(
      GENERATION_PROVIDERS.map((p) => [p.slug, selectedGenerationProviders.includes(p.slug) ? 'pending' : 'skipped']),
    ) as Record<string, string>
    setGenerationJob({
      id: '',
      status: 'running',
      progress: 0,
      message: 'Автосохранение проекта',
      logs: ['Инициализация генерации...'],
      provider_statuses: initialProviderStatuses,
    })

    try {
      const editorPayload = buildEditorPayload()
      const saved = await saveProjectEditor(projectSlug, editorPayload)
      setTokens(saved.tokens)

      const started = await startProjectGeneration(projectSlug, {
        style_id: styleId.trim(),
        brand_id: brandId.trim(),
        logos_count: assetCounts.logos,
        icons_count: assetCounts.icons,
        patterns_count: assetCounts.patterns,
        illustrations_count: assetCounts.illustrations,
        build_style: buildStyle,
        provider_slugs: [...selectedGenerationProviders],
      })

      if (!started.job_id) {
        throw new Error('Сервер не вернул job_id')
      }

      await pollEditorGenerationJob(started.job_id)
    } catch (err) {
      setGenerationError(err instanceof Error ? err.message : 'Ошибка запуска генерации.')
      setGenerationJob((current) => ({
        id: current?.id || '',
        status: 'failed',
        progress: current?.progress || 0,
        message: 'Ошибка генерации',
        logs: [...(current?.logs || []), err instanceof Error ? err.message : 'Ошибка запуска генерации.'],
        provider_statuses: current?.provider_statuses || Object.fromEntries(
          GENERATION_PROVIDERS.map((p) => [p.slug, selectedGenerationProviders.includes(p.slug) ? 'pending' : 'skipped']),
        ) as Record<string, string>,
      }))
    } finally {
      setIsGenerationStarting(false)
    }
  }

  async function pollEditorGenerationJob(jobId: string) {
    for (let attempt = 0; attempt < 600; attempt += 1) {
      const payload = await getGenerationJob(jobId)
      const job = payload.job
      setGenerationJob(job)

      if (job.style_id) {
        setStyleId(job.style_id)
      }

      if (job.status === 'failed') {
        setGenerationError(job.error || job.message || 'Генерация не удалась.')
        setGenerationErrorHint(job.error_hint || '')
      }

      if (['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(job.status)) {
        return job
      }

      await new Promise((resolve) => setTimeout(resolve, 1000))
    }

    throw new Error('Не удалось получить актуальный статус генерации (таймаут опроса)')
  }

  async function handleCancelGeneration() {
    if (!generationJob?.id || cancelRequested) return
    setCancelRequested(true)
    try {
      await cancelResultsGenerationJob(generationJob.id)
      setGenerationJob({ ...generationJob, message: 'Прерывание генерации...' })
    } catch (err) {
      setCancelRequested(false)
      setGenerationError(err instanceof Error ? err.message : 'Не удалось прервать генерацию.')
    }
  }

  async function handleReset() {
    if (!window.confirm('Сбросить проект к значениям по умолчанию?')) return
    setIsSaving(true)
    setStatus('')
    setError('')

    try {
      const payload = await resetProjectEditor(projectSlug)
      setTokens(payload.tokens)
      setName(getTokenString(payload.tokens, 'name'))
      setBrandDescription(getTokenString(payload.tokens, 'brand_description'))
      setBrandId(getTokenString(payload.tokens, 'brand_id'))
      setStyleId(getTokenString(payload.tokens, 'style_id'))
      const nextPaletteSlots = getPaletteSlots(payload.tokens)
      setPaletteSlots(nextPaletteSlots)
      setActivePaletteKeys(getActivePaletteKeys(payload.tokens))
      setPaletteSeedRole('primary')
      setPaletteSeedColor(normalizeHexColor(nextPaletteSlots.primary) || DEFAULT_PALETTE.primary)
      setPaletteSuggestions(null)
      setPaletteAssistantOpen(false)
      setActivePaletteVariant('balanced')
      setPromptFields(tokensToPromptFields(payload.tokens))
      setAssetCounts(getAssetCounts(payload.tokens))
      setIconStrokeWidth(getNestedTokenNumber(payload.tokens, 'icon', 'strokeWidth', 2))
      setIconCorner(getNestedTokenString(payload.tokens, 'icon', 'corner', 'rounded'))
      setIconFill(getNestedTokenString(payload.tokens, 'icon', 'fill', 'outline'))
      setIllustrationFormat(illustrationFormatFromTokens(payload.tokens))
      setAssetRefs(referencesToAssetRefs(payload.tokens, projectSlug))
      setBuildStyle(getNestedTokenBoolean(payload.tokens, 'generation', 'build_style', true))
      setSelectedGenerationProviders(getGenerationProviderSlugsFromTokens(payload.tokens))
      setStatus('Проект сброшен.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сбросить проект.')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <section className="project-editor">
        <div className="project-page-head">
          <div>
            <h1>Генерация бренд-комплекта</h1>
            <p>Загружаем проект...</p>
          </div>
        </div>
      </section>
    )
  }

  if (error && !editor) {
    return (
      <section className="project-editor">
        <div className="project-page-head">
          <div>
            <h1>Генерация бренд-комплекта</h1>
            <p>{error}</p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="project-editor">
      <div className="project-page-head">
        <div>
          <h1>Генерация бренд-комплекта</h1>
          <p>Настрой стиль бренда и сгенерируй логотипы, иконки, паттерны и иллюстрации</p>
        </div>
      </div>

      <form className="editor-sections" onSubmit={(event) => event.preventDefault()}>
        <section className="editor-card editor-card--progressive" data-progress-step="1">
          <div className="editor-card__head">
            <span className="step-badge">1</span>
            <div>
              <div className="step-progress-caption">Шаг 1 из 5</div>
              <h2>Бренд</h2>
              <p>Основные параметры вашего бренда</p>
            </div>
          </div>
          <div className="editor-grid editor-grid--single">
            <label className="editor-field">
              <span>Название бренда</span>
              <input type="text" value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="editor-field">
              <span>О бренде</span>
              <textarea
                value={brandDescription}
                rows={4}
                maxLength={500}
                placeholder="Кратко опишите бренд: чем занимаетесь, для кого, какое настроение и стиль. Это попадёт в превью на странице результатов."
                onChange={(event) => setBrandDescription(event.target.value)}
              />
            </label>
          </div>
          <div className="editor-grid">
            <label className="editor-field">
              <span>Style ID</span>
              <input type="text" value={styleId} placeholder={styleId ? '' : 'Будет заполнен после генерации стиля'} disabled={!styleId} onChange={(event) => setStyleId(event.target.value)} />
            </label>
            <label className="editor-field">
              <span>Brand ID</span>
              <input type="text" value={brandId} onChange={(event) => setBrandId(event.target.value)} />
            </label>
          </div>
          <div className="editor-note">Brand ID будет использоваться как идентификатор набора ассетов в структуре папок и путях для интеграции с Figma-плагином.</div>
        </section>

        <section className="editor-card editor-card--progressive" data-progress-step="2">
          <div className="editor-card__head">
            <span className="step-badge">2</span>
            <div>
              <div className="step-progress-caption">Шаг 2 из 5</div>
              <h2>Визуальный стиль</h2>
              <p>Цветовая палитра: в генерацию попадают отмеченные цвета из сетки ниже</p>
            </div>
          </div>

          <p className="editor-note editor-note--compact">
            Итоговая палитра — это ваши значения в сетке (шаг сохранения / запуска). Блок «Подбор палитры» ниже необязателен: он лишь предлагает варианты; они применятся к сетке только после нажатия Soft, Balanced или Contrast.
          </p>

          <div className="palette-grid palette-grid--six">
            {PALETTE_KEYS.map((key) => {
              const slotActive = activePaletteKeys.includes(key)
              return (
              <div
                className={`palette-item${slotActive ? '' : ' palette-item--inactive'}`}
                key={key}
              >
                <label className="palette-item__label">
                  <input type="checkbox" checked={slotActive} onChange={(event) => togglePaletteKey(key, event.target.checked)} /> <span>{PALETTE_LABELS[key]}</span>
                </label>
                <input
                  type="color"
                  className="palette-swatch"
                  value={normalizeHexColor(paletteSlots[key]) || DEFAULT_PALETTE[key]}
                  disabled={!slotActive}
                  onChange={(event) => setPaletteValue(key, event.target.value)}
                />
                <input
                  type="text"
                  className="editor-field__compact"
                  value={paletteSlots[key]}
                  disabled={!slotActive}
                  onChange={(event) => setPaletteValue(key, event.target.value)}
                />
              </div>
              )
            })}
          </div>
          <div className="editor-note editor-note--compact" hidden={activePaletteKeys.length >= 2}>Выберите минимум 2 цвета палитры. Они будут использоваться в текущей генерации.</div>

          <div className="palette-assistant-bar">
            <button
              type="button"
              className="btn btn-outline btn-inline palette-assistant-toggle"
              aria-expanded={paletteAssistantOpen}
              onClick={() => {
                const next = !paletteAssistantOpen
                setPaletteAssistantOpen(next)
                if (next && normalizeHexColor(paletteSeedColor)) {
                  void fetchPaletteSuggestions(paletteSeedRole, paletteSeedColor)
                }
              }}
            >
              {paletteAssistantOpen ? 'Скрыть подбор палитры' : 'Подобрать палитру по опорному цвету (необязательно)'}
            </button>
          </div>

          {paletteAssistantOpen ? (
            <div className="palette-autofill">
              <div className="palette-autofill__head">
                <div>
                  <h3>Подбор палитры</h3>
                  <p>
                    Сейчас за опору взят цвет {capitalizePaletteLabel(paletteSeedRole)}.
                  </p>
                  <p>
                    Нажмите вариант Soft / Balanced / Contrast, чтобы подставить предложенные 6 цветов. Пока не нажали — в генерации используются только ваши значения в сетке.
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-inline palette-autofill__refresh"
                  disabled={isPaletteLoading || !normalizeHexColor(paletteSeedColor)}
                  onClick={() => void fetchPaletteSuggestions(paletteSeedRole, paletteSeedColor)}
                >
                  {isPaletteLoading ? 'Обновляем...' : 'Обновить варианты'}
                </button>
              </div>
              <div className="palette-autofill__actions">
                {(['soft', 'balanced', 'contrast'] as const).map((variantName) => (
                  <button
                    type="button"
                    className={`small-action palette-variant-btn${activePaletteVariant === variantName ? ' is-active' : ''}`}
                    key={variantName}
                    onClick={() => void applySuggestedPalette(variantName)}
                  >
                    {variantName === 'soft' ? 'Soft' : variantName === 'balanced' ? 'Balanced' : 'Contrast'}
                  </button>
                ))}
              </div>
              <div className="palette-autofill__preview">
                {paletteSuggestions?.[activePaletteVariant]
                  ? PALETTE_KEYS.map((key) => (
                    <div className="palette-preview-swatch" key={key}>
                      <div className="palette-preview-swatch__color" style={{ background: paletteSuggestions[activePaletteVariant][key] }}></div>
                      <div className="palette-preview-swatch__meta">
                        <span className="palette-preview-swatch__label">{PALETTE_LABELS[key]}</span>
                        <strong className="palette-preview-swatch__value">{paletteSuggestions[activePaletteVariant][key]}</strong>
                      </div>
                    </div>
                  ))
                  : null}
              </div>
            </div>
          ) : null}
        </section>

        <section className="editor-card editor-card--progressive" data-progress-step="3">
          <div className="editor-card__head">
            <span className="step-badge">3</span>
            <div>
              <div className="step-progress-caption">Шаг 3 из 5</div>
              <h2>Генерируемые ассеты</h2>
              <p>Промпты, референсы и параметры для логотипов, иконок, паттернов и иллюстраций</p>
            </div>
          </div>
          <div className="asset-tabs" role="tablist" aria-label="Тип ассетов">
            {ASSET_TYPES.map((type) => (
              <button
                type="button"
                className={`asset-tab${activeAssetType === type ? ' asset-tab--active' : ''}`}
                role="tab"
                aria-selected={activeAssetType === type ? 'true' : 'false'}
                aria-controls={`asset-panel-${type}`}
                id={`asset-tab-${type}`}
                key={type}
                onClick={() => setActiveAssetType(type)}
              >
                {ASSET_LABELS[type]}
              </button>
            ))}
          </div>

          {ASSET_TYPES.map((type) => (
            <div
              id={`asset-panel-${type}`}
              className={`asset-panel${activeAssetType === type ? ' asset-panel--active' : ''}`}
              role="tabpanel"
              aria-labelledby={`asset-tab-${type}`}
              hidden={activeAssetType !== type}
              key={type}
            >
              <label className="editor-field">
                <span>Промпт</span>
                <textarea
                  rows={4}
                  placeholder={ASSET_PLACEHOLDERS[type]}
                  autoComplete="off"
                  value={promptFields[type]}
                  onChange={(event) => setPromptFields((current) => ({ ...current, [type]: event.target.value }))}
                />
              </label>

              {type === 'icons' ? (
                <div className="editor-grid">
                  <label className="editor-field">
                    <span>Stroke Width (px)</span>
                    <input type="number" min="0" step="0.5" value={iconStrokeWidth} onChange={(event) => setIconStrokeWidth(Number(event.target.value || 0))} />
                  </label>
                  <label className="editor-field">
                    <span>Corner</span>
                    <select value={iconCorner} onChange={(event) => setIconCorner(event.target.value)}>
                      <option value="rounded">Rounded</option>
                      <option value="square">Square</option>
                      <option value="butt">Butt</option>
                    </select>
                  </label>
                  <label className="editor-field">
                    <span>Fill</span>
                    <select value={iconFill} onChange={(event) => setIconFill(event.target.value)}>
                      <option value="outline">Outline</option>
                      <option value="filled">Filled</option>
                      <option value="duotone">Duotone</option>
                    </select>
                  </label>
                </div>
              ) : null}

              {type === 'illustrations' ? (
                <div className="illustration-format-row" role="radiogroup" aria-label="Формат иллюстрации">
                  <label className="illustration-format-check">
                    <input
                      type="radio"
                      name={`illustration-format-${projectSlug}`}
                      value="vector"
                      checked={illustrationFormat === 'vector'}
                      onChange={() => setIllustrationFormat('vector')}
                    />
                    <span>Вектор</span>
                  </label>
                  <label className="illustration-format-check">
                    <input
                      type="radio"
                      name={`illustration-format-${projectSlug}`}
                      value="raster"
                      checked={illustrationFormat === 'raster'}
                      onChange={() => setIllustrationFormat('raster')}
                    />
                    <span>Растр</span>
                  </label>
                </div>
              ) : null}

              <div className="editor-grid editor-grid--narrow asset-panel-counts">
                <label className="editor-field">
                  <span>{assetCountLabel(type)}</span>
                  <input type="number" min="1" max="20" value={assetCounts[type]} onChange={(event) => setAssetCount(type, event.target.value)} />
                </label>
              </div>

              <div className="asset-panel-refs">
                <span className="asset-panel-refs__title">{ASSET_REF_LABELS[type]}</span>
                <p className="asset-panel-refs__hint">Изображения, которые задают желаемую эстетику для этого типа ассетов.</p>
                <label className="btn btn-primary btn-upload btn-upload--compact asset-panel-refs__upload">
                  <input
                    type="file"
                    multiple
                    accept=".png,.jpg,.jpeg,.webp,.gif,.bmp"
                    hidden
                    disabled={refsLoadingType === type}
                    onChange={(event) => {
                      void handleUploadRefs(type, event.target.files)
                      event.currentTarget.value = ''
                    }}
                  />
                  <span>{refsLoadingType === type ? 'Загружаем...' : 'Загрузить'}</span>
                </label>
                <div className="refs-grid refs-grid--compact">
                  {refsLoadingType === type && !assetRefs[type].length ? <div className="refs-empty">Загрузка...</div> : null}
                  {refsLoadingType !== type && !assetRefs[type].length ? <div className="refs-empty">Референсы пока не загружены</div> : null}
                  {assetRefs[type].map((ref) => (
                    <div className="ref-card" key={`${type}-${ref.path}`}>
                      <a href={ref.url} target="_blank" rel="noopener" className="ref-card__preview">
                        <img src={ref.url} alt={ref.name} className="ref-card__image" />
                      </a>
                      <button
                        type="button"
                        className="ref-delete"
                        disabled={refsLoadingType === type}
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          void handleDeleteRef(type, ref.path)
                        }}
                      >
                        Удалить
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </section>

        <section className="editor-card editor-card--progressive" data-progress-step="4">
          <div className="editor-card__head">
            <span className="step-badge">4</span>
            <div>
              <div className="step-progress-caption">Шаг 4 из 5</div>
              <h2>Параметры генерации</h2>
              <p>Финальные настройки перед запуском генерации бренд-комплекта</p>
            </div>
          </div>
          <label className="build-style-box">
            <input
              type="checkbox"
              checked={buildStyle}
              onChange={(event) => {
                const next = event.target.checked
                setBuildStyle(next)
                if (next) {
                  setSelectedGenerationProviders((prev) => (prev.includes('recraft') ? prev : [...prev, 'recraft']))
                }
              }}
            />
            <div>
              <strong>Создать новый стиль по загруженным референсам</strong>
              <span>Если включено, Recraft проанализирует все референсы с вкладок ассетов и создаст новый Style ID.</span>
            </div>
          </label>

          <div className="editor-field generation-providers-pick">
            <span>Нейросети для этого запуска</span>
            <p className="generation-providers-hint">
              Отметьте модели, которые должны выдать ассеты. Без Recraft в проекте должен&nbsp;быть сохранён Style&nbsp;ID.
            </p>
            <div className="generation-providers-checkboxes" role="group" aria-label="Провайдеры генерации">
              {GENERATION_PROVIDERS.map((p) => (
                <label key={p.slug} className="generation-provider-check">
                  <input
                    type="checkbox"
                    checked={selectedGenerationProviders.includes(p.slug)}
                    onChange={(event) => toggleGenerationProvider(p.slug, event.target.checked)}
                  />
                  <span>{p.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="generated-summary">
            <h3>Что будет сгенерировано:</h3>
            <ul>
              <li>Иконки в заданном стиле и цветовой палитре</li>
              <li>Варианты логотипов в едином стиле бренда</li>
              <li>Seamless паттерны с заданными мотивами</li>
              <li>Иллюстрации в едином визуальном стиле</li>
              <li>JSON-токены для интеграции с Figma</li>
            </ul>
          </div>
        </section>

        <section className="editor-card editor-card--cta editor-card--progressive" data-progress-step="5">
          <div className="step-progress-caption step-progress-caption--center">Шаг 5 из 5</div>
          <div className="cta-icon">✧</div>
          <h2>Готово к генерации?</h2>
          <p>Все параметры настроены. Нажмите кнопку ниже, чтобы запустить генерацию бренд-комплекта.</p>
          <button type="button" className="btn btn-primary editor-generate-btn" disabled={isGenerationStarting} onClick={() => void handleGenerate()}>
            {isGenerationStarting ? 'Запускаем генерацию...' : 'Собрать бренд-комплект'}
          </button>
          <div className="cta-stats">
            <span><strong>{assetCounts.logos}</strong> вариантов логотипа</span>
            <span><strong>{assetCounts.icons}</strong> иконок</span>
            <span><strong>{assetCounts.patterns}</strong> паттернов</span>
            <span><strong>{assetCounts.illustrations}</strong> иллюстраций</span>
          </div>
          <div className="editor-status">
            {generationJob
              ? generationJob.status === 'completed'
                ? 'Бренд-комплект успешно сгенерирован ✅'
                : generationJob.status === 'completed_with_errors'
                  ? 'Генерация завершена с ошибками'
                  : generationJob.status === 'failed'
                    ? 'Ошибка генерации'
                    : generationJob.status === 'cancelled'
                      ? 'Генерация прервана'
                      : 'Идёт генерация...'
              : ''}
          </div>
        </section>

        <div className="editor-actions-row">
          <button type="button" className="btn btn-outline btn-inline" disabled={isSaving} onClick={handleSave}>
            {isSaving ? 'Сохраняем...' : 'Сохранить'}
          </button>
          <a href={`/projects/${projectSlug}/download`} className="btn btn-outline btn-inline">Скачать конфигурацию проекта</a>
          <a href={`/projects/${projectSlug}/download-bundle`} className="btn btn-outline btn-inline">Скачать ZIP (с референсами)</a>
          <button type="button" className="btn btn-inline btn-reset-light" disabled={isSaving} onClick={handleReset}>Сброс</button>
        </div>
        {status ? <div className="editor-status">{status}</div> : null}
        {error ? <div className="editor-status">{error}</div> : null}
      </form>
      {isGenerationModalOpen && generationJob ? (
        <ProjectGenerationModal
          job={generationJob}
          projectSlug={projectSlug}
          cancelRequested={cancelRequested}
          errorMessage={generationError}
          errorHint={generationErrorHint}
          onCancel={handleCancelGeneration}
          onClose={() => setIsGenerationModalOpen(false)}
          onDismissError={() => {
            setGenerationError('')
            setGenerationErrorHint('')
          }}
        />
      ) : null}
    </section>
  )
}

function ProjectGenerationModal({
  job,
  projectSlug,
  cancelRequested,
  errorMessage,
  errorHint,
  onCancel,
  onClose,
  onDismissError,
}: {
  job: GenerationJob
  projectSlug: string
  cancelRequested: boolean
  errorMessage: string
  errorHint: string
  onCancel: () => void
  onClose: () => void
  onDismissError: () => void
}) {
  const terminal = ['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(String(job.status || ''))
  const canOpenResult = job.status === 'completed' || job.status === 'completed_with_errors'
  const statuses = job.provider_statuses || job.providers || {}

  useEffect(() => {
    document.body.classList.add('modal-open')
    return () => document.body.classList.remove('modal-open')
  }, [])

  return dashboardOverlayPortal(
    <>
      <div className="generation-modal">
        <div className="generation-modal__backdrop" onClick={onClose}></div>
        <div className="generation-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="generation-modal-title">
          <button type="button" className="generation-modal__close" onClick={onClose}>×</button>
          <h2 id="generation-modal-title">Генерация бренд-комплекта</h2>
          <div className="generation-progress">
            <div className="generation-progress__bar" style={{ width: `${Number(job.progress || 0)}%` }}></div>
          </div>
          <div className="generation-status-row">
            <strong>{Number(job.progress || 0)}%</strong>
            <span className="generation-status-text">
              {job.status === 'cancelled'
                ? 'Генерация прервана'
                : job.status === 'failed'
                  ? 'Ошибка генерации'
                  : job.status === 'completed'
                    ? 'Завершено'
                    : job.status === 'completed_with_errors'
                      ? 'Завершено с ошибками'
                      : job.message || job.status_text || 'Выполняется'}
            </span>
          </div>
          <ProviderStatusRail statuses={statuses} />
          <label className="generation-log-label">Лог операций</label>
          <GenerationLogView logs={job.logs} />
          <div className="generation-modal__actions">
            {!terminal ? (
              <button type="button" className="btn btn-outline btn-inline" disabled={cancelRequested} onClick={onCancel}>
                {cancelRequested ? 'Прерываем...' : 'Прервать генерацию'}
              </button>
            ) : null}
            {canOpenResult ? (
              <Link
                className="btn btn-primary btn-inline"
                to={`/projects/${projectSlug}/results${job.id ? `?job=${encodeURIComponent(job.id)}` : ''}`}
              >
                Посмотреть результат
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      {errorMessage ? (
        <div className="generation-error-modal">
          <div className="generation-error-modal__backdrop" onClick={onDismissError}></div>
          <div className="generation-error-modal__dialog" role="alertdialog" aria-modal="true" aria-labelledby="generation-error-title" aria-describedby="generation-error-body">
            <button type="button" className="generation-modal__close" onClick={onDismissError}>×</button>
            <h2 id="generation-error-title">Ошибка генерации</h2>
            <p id="generation-error-body" className="generation-error-modal__message">{errorMessage}</p>
            {errorHint ? <p className="generation-error-modal__hint">{errorHint}</p> : null}
            <div className="generation-error-modal__actions">
              <button type="button" className="btn btn-primary btn-inline" onClick={onDismissError}>Ок</button>
            </div>
          </div>
        </div>
      ) : null}
    </>,
  )
}

function getTokenRecord(tokens: ProjectTokens, key: string): Record<string, unknown> {
  const value = tokens[key]
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function getTokenString(tokens: ProjectTokens, key: string): string {
  const value = tokens[key]
  return typeof value === 'string' ? value : ''
}

function getNestedTokenString(tokens: ProjectTokens, group: string, key: string, fallback: string): string {
  const record = getTokenRecord(tokens, group)
  const value = record[key]
  return typeof value === 'string' ? value : fallback
}

function getNestedTokenNumber(tokens: ProjectTokens, group: string, key: string, fallback: number): number {
  const record = getTokenRecord(tokens, group)
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function getNestedTokenBoolean(tokens: ProjectTokens, group: string, key: string, fallback: boolean): boolean {
  const record = getTokenRecord(tokens, group)
  const value = record[key]
  return typeof value === 'boolean' ? value : fallback
}

function getNestedTokenArray(tokens: ProjectTokens, group: string, key: string): unknown[] {
  const record = getTokenRecord(tokens, group)
  const value = record[key]
  return Array.isArray(value) ? value : []
}

const ALL_GENERATION_PROVIDER_SLUGS = GENERATION_PROVIDERS.map((p) => p.slug)

function getGenerationProviderSlugsFromTokens(tokens: ProjectTokens): string[] {
  const raw = getNestedTokenArray(tokens, 'generation', 'provider_slugs')
  const allowed = new Set<string>(ALL_GENERATION_PROVIDER_SLUGS)
  const picked: string[] = []
  for (const item of raw) {
    const s = String(item).trim()
    if (allowed.has(s) && !picked.includes(s)) {
      picked.push(s)
    }
  }
  if (picked.length) {
    return picked
  }
  return [...ALL_GENERATION_PROVIDER_SLUGS]
}

function getPaletteSlots(tokens: ProjectTokens): Record<PaletteKey, string> {
  const paletteSlots = getTokenRecord(tokens, 'palette_slots')
  const palette = getTokenRecord(tokens, 'palette')

  return PALETTE_KEYS.reduce<Record<PaletteKey, string>>((acc, key) => {
    const raw = paletteSlots[key] || palette[key]
    acc[key] = typeof raw === 'string' ? raw.toUpperCase() : DEFAULT_PALETTE[key]
    return acc
  }, { ...DEFAULT_PALETTE })
}

function getActivePaletteKeys(tokens: ProjectTokens): PaletteKey[] {
  const generation = getTokenRecord(tokens, 'generation')
  const raw = generation.active_palette_keys
  if (!Array.isArray(raw)) return ['primary', 'secondary', 'accent']
  const normalized = raw.filter((key): key is PaletteKey => typeof key === 'string' && PALETTE_KEYS.includes(key as PaletteKey))
  return normalized.length >= 2 ? normalized.slice(0, 6) : ['primary', 'secondary', 'accent']
}

function tokensToPromptFields(tokens: ProjectTokens): Record<AssetType, string> {
  const prompts = getTokenRecord(tokens, 'prompts')
  return ASSET_TYPES.reduce<Record<AssetType, string>>((acc, type) => {
    acc[type] = promptArrayToSingleFieldText(prompts[type])
    return acc
  }, { logos: '', icons: '', patterns: '', illustrations: '' })
}

/** Один текст в форме — в tokens повторяется по числу вариантов (ожидание CLI). */
function expandPromptFieldForCount(text: string, count: number): string[] {
  const trimmed = text.trim()
  if (!trimmed || count <= 0) return []
  return Array.from({ length: count }, () => trimmed)
}

function promptArrayToSingleFieldText(raw: unknown): string {
  const arr = normalizePromptArray(raw)
  if (!arr.length) return ''
  if (arr.every((item) => item === arr[0])) return arr[0]
  return arr.join('\n')
}

function getAssetCounts(tokens: ProjectTokens): Record<AssetType, number> {
  const generation = getTokenRecord(tokens, 'generation')
  return ASSET_TYPES.reduce<Record<AssetType, number>>((acc, type) => {
    acc[type] = clampAssetCount(generation[`${type}_count`], DEFAULT_ASSET_COUNTS[type])
    return acc
  }, { ...DEFAULT_ASSET_COUNTS })
}

function normalizePromptArray(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item).trim()).filter(Boolean)
  }
  if (typeof raw === 'string') {
    return raw.split(/[,;\n]+/).map((item) => item.trim()).filter(Boolean)
  }
  return []
}

function clampAssetCount(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value || ''), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(1, Math.min(20, parsed))
}

function assetCountLabel(type: AssetType): string {
  if (type === 'logos') return 'Количество вариантов логотипа'
  if (type === 'icons') return 'Количество иконок'
  if (type === 'patterns') return 'Количество паттернов'
  return 'Количество иллюстраций'
}

function normalizeStyleRefs(raw: unknown, projectSlug: string): StyleRef[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      const path = typeof item === 'string'
        ? item
        : item && typeof item === 'object' && 'path' in item && typeof item.path === 'string'
          ? item.path
          : ''
      if (!path) return null
      const name = path.split('/').pop() || 'ref'
      const url = item && typeof item === 'object' && 'url' in item && typeof item.url === 'string'
        ? item.url
        : `/projects/${projectSlug}/refs/${encodeURIComponent(name)}`
      return { path, name, url }
    })
    .filter((item): item is StyleRef => Boolean(item))
}

function referencesToAssetRefs(tokens: ProjectTokens, projectSlug: string): Record<AssetType, StyleRef[]> {
  const perType = ASSET_TYPES.reduce<Record<AssetType, StyleRef[]>>((acc, type) => {
    acc[type] = normalizeStyleRefs(getNestedTokenArray(tokens, 'references', type), projectSlug)
    return acc
  }, {
    logos: [],
    icons: [],
    patterns: [],
    illustrations: [],
  })
  const hasPerType = ASSET_TYPES.some((type) => perType[type].length > 0)
  const legacy = normalizeStyleRefs(getNestedTokenArray(tokens, 'references', 'style_images'), projectSlug)
  if (!hasPerType && legacy.length) {
    return ASSET_TYPES.reduce<Record<AssetType, StyleRef[]>>((acc, type) => {
      acc[type] = legacy
      return acc
    }, {
      logos: [],
      icons: [],
      patterns: [],
      illustrations: [],
    })
  }
  return perType
}

function capitalizePaletteLabel(key: PaletteKey): string {
  return PALETTE_LABELS[key] || key[0].toUpperCase() + key.slice(1)
}

function normalizeHexColor(value: string): string {
  const trimmed = value.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toUpperCase()
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    return `#${trimmed.slice(1).split('').map((char) => char + char).join('')}`.toUpperCase()
  }
  return ''
}

function FigmaPluginPage() {
  return (
    <section className="figma-plugin-page profile-page">
      <div className="profile-page__head">
        <h1>Figma-плагин KYBBY</h1>
        <p>Перенесите сгенерированный бренд-комплект из KYBBY в ваш файл Figma</p>
      </div>

      <article className="profile-card figma-plugin-hero">
        <p className="figma-plugin-hero__eyebrow">Интеграция</p>
        <h2>KYBBY BrandKit Importer</h2>
        <p className="figma-plugin-hero__text">
          Плагин создаёт в Figma страницу с логотипами, иконками, паттернами и иллюстрациями вашего бренда —
          в удобной структуре, готовой к дальнейшей работе дизайнером.
        </p>
        <ul className="figma-plugin-tags" aria-label="Что импортируется">
          <li>Логотипы</li>
          <li>Иконки</li>
          <li>Паттерны</li>
          <li>Иллюстрации</li>
        </ul>
      </article>

      <article className="profile-card">
        <h2>Установка в Figma</h2>
        <ol className="figma-plugin-steps">
          <li>Скачайте архив плагина KYBBY и распакуйте его на компьютер.</li>
          <li>Убедитесь, что в одной папке лежат три файла: <strong>manifest.json</strong>, <strong>code.js</strong>, <strong>ui.html</strong>.</li>
          <li>Откройте Figma → меню <strong>Плагины</strong> (Plugins).</li>
          <li>Выберите <strong>Development</strong> → <strong>Import plugin from manifest…</strong> (не «New plugin»).</li>
          <li>Укажите <strong>manifest.json</strong> из этой папки и подтвердите установку.</li>
          <li>Запустите <strong>KYBBY BrandKit Importer</strong> из списка плагинов.</li>
        </ol>
        <p className="figma-plugin-note">
          Если окно плагина белое и пустое — Figma не нашла <strong>ui.html</strong>. Скачайте архив заново и импортируйте manifest из папки со всеми файлами. При необходимости распакуйте в путь без кириллицы, например <code>C:\kybby-plugin</code>.
        </p>
        <div className="figma-plugin-actions">
          <a href="/figma-plugin/download" className="btn btn-primary">
            Скачать плагин KYBBY
          </a>
        </div>
        <p className="figma-plugin-note">
          Плагин устанавливается в ваш аккаунт Figma и остаётся доступным для повторного использования. В поле адреса KYBBY используйте <strong>http://localhost:8000</strong> (не 127.0.0.1), если работаете локально.
        </p>
      </article>

      <article className="profile-card">
        <h2>Как импортировать проект</h2>
        <ol className="figma-plugin-steps">
          <li>Создайте или откройте проект в KYBBY и дождитесь генерации бренд-комплекта.</li>
          <li>На странице <strong>Результаты</strong> нажмите «Экспорт бренд-комплекта».</li>
          <li>Скопируйте <strong>Brand ID</strong> и <strong>адрес KYBBY</strong> на той же странице.</li>
          <li>В плагине вставьте эти значения, выберите провайдера и нажмите Import.</li>
        </ol>
        <p className="figma-plugin-note">
          Brand ID у каждого проекта свой. Копировать данные для плагина удобнее на странице <strong>Результаты</strong> — там они собраны в одном месте.
        </p>
      </article>
    </section>
  )
}

function ProfilePage({ onSessionRefresh }: { onSessionRefresh: () => Promise<void> }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [name, setName] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')
  const [recraftApiKey, setRecraftApiKey] = useState('')
  const [openrouterApiKey, setOpenrouterApiKey] = useState('')
  const [avatar, setAvatar] = useState<File | null>(null)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [highlightMissingCurrentPassword, setHighlightMissingCurrentPassword] = useState(false)

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
    setHighlightMissingCurrentPassword(false)

    const form = event.currentTarget
    const submittedCurrent = String(new FormData(form).get('current_password') ?? '').trim()
    const submittedNew = String(new FormData(form).get('new_password') ?? '').trim()
    const submittedConfirm = String(new FormData(form).get('new_password_confirm') ?? '').trim()

    const wantsPasswordChange = Boolean(submittedCurrent || submittedNew || submittedConfirm)
    if (wantsPasswordChange) {
      if (!submittedCurrent) {
        setHighlightMissingCurrentPassword(true)
        setError('Введите текущий пароль.')
        return
      }
      if (!submittedNew) {
        setError('Введите новый пароль.')
        return
      }
      if (submittedNew.length < 8) {
        setError('Новый пароль должен содержать минимум 8 символов.')
        return
      }
      if (submittedNew !== submittedConfirm) {
        setError('Новый пароль и подтверждение не совпадают.')
        return
      }
    }

    setIsSaving(true)

    const formData = new FormData()
    formData.append('name', name)
    formData.append('current_password', submittedCurrent)
    formData.append('new_password', submittedNew)
    formData.append('new_password_confirm', submittedConfirm)
    formData.append('remove_avatar', '0')
    formData.append('recraft_api_key', recraftApiKey)
    formData.append('openrouter_api_key', openrouterApiKey)
    if (avatar) formData.append('avatar', avatar)

    try {
      const payload = await updateProfile(formData)
      setProfile(payload.profile)
      setName(payload.profile.name)
      setCurrentPassword('')
      setNewPassword('')
      setNewPasswordConfirm('')
      setRecraftApiKey('')
      setOpenrouterApiKey('')
      setAvatar(null)
      setSuccess('Изменения сохранены')
      setHighlightMissingCurrentPassword(false)
      await onSessionRefresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось сохранить профиль.'
      setError(message)
      if (/текущий пароль/i.test(message)) {
        setHighlightMissingCurrentPassword(true)
      }
    } finally {
      setIsSaving(false)
    }
  }

  async function handleRemoveAvatar() {
    setError('')
    setSuccess('')

    const formData = new FormData()
    formData.append('name', name)
    formData.append('current_password', '')
    formData.append('new_password', '')
    formData.append('new_password_confirm', '')
    formData.append('remove_avatar', '1')
    formData.append('recraft_api_key', '')
    formData.append('openrouter_api_key', '')

    try {
      const payload = await updateProfile(formData)
      setProfile(payload.profile)
      setSuccess('Изменения сохранены')
      await onSessionRefresh()
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
                <svg className="profile-upload-btn__icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" x2="12" y1="3" y2="15" />
                </svg>
                Загрузить фото
                <input type="file" name="avatar" accept=".png,.jpg,.jpeg,.webp" hidden onChange={(event) => setAvatar(event.target.files?.[0] || null)} />
              </label>
            </div>

            <div className="profile-fields">
              <label className="editor-field">
                <span>ФИО</span>
                <span className="profile-input-wrap">
                  <span className="profile-input-icon" aria-hidden="true">
                    <UserIcon />
                  </span>
                  <input type="text" name="name" value={name} minLength={2} required onChange={(event) => setName(event.target.value)} />
                </span>
              </label>
              <label className="editor-field">
                <span>Email</span>
                <span className="profile-input-wrap">
                  <span className="profile-input-icon" aria-hidden="true">
                    <EmailIcon />
                  </span>
                  <input type="email" className="profile-email-input" value={profile?.email || ''} disabled />
                </span>
              </label>
              <p className="profile-field-hint">Email нельзя изменить</p>
              <div className="profile-role-row">
                <span>Роль:</span>
                <strong>User</strong>
              </div>
            </div>
          </div>
        </article>

        <div className="profile-credentials-row">
          <article className="profile-card profile-card--password-change">
            <h2>Смена пароля</h2>
            <p className="profile-field-hint profile-card__intro-hint">
              Чтобы сменить пароль, заполните все три поля. Оставьте пустыми, если пароль менять не нужно.
            </p>
            <div className="profile-password-grid profile-password-grid--change-password">
              <label className="editor-field">
                <span>Текущий пароль</span>
                <span
                  className={`profile-input-wrap${highlightMissingCurrentPassword ? ' profile-input-wrap--error' : ''}`}
                >
                  <span className="profile-input-icon" aria-hidden="true">
                    <LockIcon />
                  </span>
                  <input
                    type="password"
                    name="current_password"
                    placeholder="Введите текущий пароль"
                    value={currentPassword}
                    autoComplete="current-password"
                    aria-invalid={highlightMissingCurrentPassword}
                    onChange={(event) => {
                      setCurrentPassword(event.target.value)
                      if (event.target.value.trim()) setHighlightMissingCurrentPassword(false)
                    }}
                  />
                </span>
              </label>
              <label className="editor-field">
                <span>Новый пароль</span>
                <span className="profile-input-wrap">
                  <span className="profile-input-icon" aria-hidden="true">
                    <LockIcon />
                  </span>
                  <input
                    type="password"
                    name="new_password"
                    placeholder="Введите новый пароль"
                    value={newPassword}
                    autoComplete="new-password"
                    minLength={8}
                    onChange={(event) => setNewPassword(event.target.value)}
                  />
                </span>
                <p className="profile-field-hint">Минимум 8 символов</p>
              </label>
              <label className="editor-field">
                <span>Подтвердите новый пароль</span>
                <span className="profile-input-wrap">
                  <span className="profile-input-icon" aria-hidden="true">
                    <LockIcon />
                  </span>
                  <input
                    type="password"
                    name="new_password_confirm"
                    placeholder="Повторите новый пароль"
                    value={newPasswordConfirm}
                    autoComplete="new-password"
                    minLength={8}
                    onChange={(event) => setNewPasswordConfirm(event.target.value)}
                  />
                </span>
              </label>
            </div>
          </article>

          <article className="profile-card">
            <h2>API ключи провайдеров</h2>
            <div className="profile-password-grid">
              <label className="editor-field">
                <span>Recraft API key</span>
                <div className="profile-input-adorned">
                  <input
                    type="password"
                    name="recraft_api_key"
                    placeholder={profile?.api_keys?.recraft?.configured ? `Сохранён: ${profile.api_keys.recraft.masked}` : 'Введите Recraft API key'}
                    value={recraftApiKey}
                    onChange={(event) => setRecraftApiKey(event.target.value)}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="profile-api-info-btn profile-input-adorned__hint"
                    aria-label="Подсказка: Recraft API key"
                    aria-describedby="profile-api-hint-recraft"
                  >
                    i
                  </button>
                  <span id="profile-api-hint-recraft" className="profile-input-adorned__tooltip" role="tooltip">
                    Оставьте поле пустым, чтобы сохранить текущий ключ
                  </span>
                </div>
              </label>
              <label className="editor-field">
                <span>OpenRouter API key</span>
                <div className="profile-input-adorned">
                  <input
                    type="password"
                    name="openrouter_api_key"
                    placeholder={profile?.api_keys?.openrouter?.configured ? `Сохранён: ${profile.api_keys.openrouter.masked}` : 'Введите OpenRouter API key'}
                    value={openrouterApiKey}
                    onChange={(event) => setOpenrouterApiKey(event.target.value)}
                    autoComplete="off"
                  />
                  <button
                    type="button"
                    className="profile-api-info-btn profile-input-adorned__hint"
                    aria-label="Подсказка: OpenRouter API key"
                    aria-describedby="profile-api-hint-openrouter"
                  >
                    i
                  </button>
                  <span id="profile-api-hint-openrouter" className="profile-input-adorned__tooltip" role="tooltip">
                    Используется для Seedream, Flux, Nano Banana и GPT-5 Image Mini
                  </span>
                </div>
              </label>
            </div>
          </article>
        </div>

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
  const navigate = useNavigate()
  const importInputRef = useRef<HTMLInputElement>(null)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [error, setError] = useState('')
  const [projectPendingDelete, setProjectPendingDelete] = useState<ProjectSummary | null>(null)
  const [isDeletingProject, setIsDeletingProject] = useState(false)

  useEffect(() => {
    let alive = true

    listProjects()
      .then((payload) => {
        if (!alive) return
        setProjects(payload.projects)
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
      navigate(payload.redirect_url.replace(/^\/app/, ''))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать проект.')
      setIsCreating(false)
    }
  }

  function handleImportClick() {
    importInputRef.current?.click()
  }

  async function handleImportFileChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    input.value = ''
    if (!file) return

    setError('')
    setIsImporting(true)

    try {
      const payload = await importProjectBundle(file)
      if (payload.warnings?.length) {
        sessionStorage.setItem(
          `kybby_import_warnings:${payload.project.slug}`,
          payload.warnings.join('; '),
        )
      }
      navigate(payload.redirect_url.replace(/^\/app/, ''))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось импортировать проект.')
      setIsImporting(false)
    }
  }

  async function confirmDeleteProject() {
    if (!projectPendingDelete) return

    setError('')
    setIsDeletingProject(true)
    try {
      await deleteProject(projectPendingDelete.slug)
      setProjects((items) => items.filter((item) => item.slug !== projectPendingDelete.slug))
      setProjectPendingDelete(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить проект.')
    } finally {
      setIsDeletingProject(false)
    }
  }

  return (
    <section className="dashboard-content projects-dashboard">
      <div className="dashboard-head projects-head">
        <h1>Мои проекты</h1>
        <div className="projects-actions dashboard-head__actions">
          <div className="projects-primary-actions">
            <form className="dashboard-create-form projects-create-form" onSubmit={(event) => event.preventDefault()}>
              <input type="hidden" name="name" value="Новый проект" />
              <button type="button" className="btn btn-primary dashboard-create-btn projects-create-btn" disabled={isCreating || isImporting} onClick={handleCreateProject}>
                {isCreating ? 'Создаём...' : 'Создать проект'}
              </button>
            </form>
            <button
              type="button"
              className="btn btn-outline dashboard-import-btn projects-import-btn"
              disabled={isCreating || isImporting}
              onClick={handleImportClick}
            >
              {isImporting ? 'Импортируем...' : 'Импортировать проект'}
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".zip,application/zip"
              className="projects-import-input"
              hidden
              onChange={handleImportFileChange}
            />
          </div>
        </div>
      </div>

      {error ? <div className="form-alert form-alert--error">{error}</div> : null}

      {isLoading ? (
        <div className="dashboard-empty">
          <p>Загружаем проекты...</p>
        </div>
      ) : projects.length > 0 ? (
        <div className="project-grid projects-grid">
          {projects.map((project) => (
            <article className="project-card" key={project.slug}>
              <Link to={`/projects/${project.slug}/results`} className="project-card__main-link" aria-label={`Открыть результаты генерации ${project.name}`}></Link>
              <div className="project-card__icon">
                <span>✦</span>
                <span>✦</span>
              </div>
              <div className="project-card__body">
                <h2>{project.name}</h2>
                <p>Дата создания:</p>
                <span>{project.created_at.slice(0, 10)}</span>
              </div>
              <div className="project-card__aside">
                {project.is_imported ? (
                  <div className="project-card__status">
                    <span className="project-card__badge" title="Проект импортирован из ZIP-архива">Внешний</span>
                  </div>
                ) : null}
                <div className="project-card__actions">
                  <form className="project-card__delete-form" onSubmit={(event) => event.preventDefault()}>
                    <button
                      type="button"
                      className="project-card__action project-card__action--delete"
                      aria-label="Удалить проект"
                      onClick={() => setProjectPendingDelete(project)}
                    >
                      <ProjectCardDeleteIcon />
                    </button>
                  </form>
                  <Link to={`/projects/${project.slug}`} className="project-card__action project-card__action--edit" aria-label="Открыть редактор проекта">
                    <ProjectCardEditIcon />
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="dashboard-empty">
          <p>У вас пока нет проектов. Создайте первый проект и сразу перейдите к его редактированию.</p>
        </div>
      )}

      <AppConfirmModal
        open={projectPendingDelete !== null}
        message={projectPendingDelete ? `Удалить проект «${projectPendingDelete.name}»?` : ''}
        confirmLabel="Ок"
        cancelLabel="Отмена"
        isBusy={isDeletingProject}
        onConfirm={() => void confirmDeleteProject()}
        onCancel={() => {
          if (!isDeletingProject) setProjectPendingDelete(null)
        }}
      />
    </section>
  )
}

function ProjectCardDeleteIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4.8A1.8 1.8 0 0 1 9.8 3h4.4A1.8 1.8 0 0 1 16 4.8V6" />
      <path d="M19 6l-.8 13.2a1.8 1.8 0 0 1-1.8 1.6H7.6a1.8 1.8 0 0 1-1.8-1.6L5 6" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  )
}

function ProjectCardEditIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
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

function QuestionIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.4a2.6 2.6 0 0 1 4.6 1.3c0 1.6-2.1 2-2.1 3.7" />
      <circle cx="12" cy="17.2" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  )
}

function CopyIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  )
}

export default App
