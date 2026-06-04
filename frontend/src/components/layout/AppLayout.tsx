import { type MouseEvent, type ReactNode, useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { clearPendingHelpGuide, hasPendingHelpGuide } from '../../config/helpGuide'
import {
  PROVIDER_NEWS_ENTRIES,
  PROVIDER_NEWS_VERSION,
  providerNewsStorageKey,
  readSeenProviderNewsVersion,
} from '../../config/providerNews'
import type { AuthMeResponse } from '../../types/auth'
import { DashboardHelpGuide, DashboardHelpIcon } from './DashboardHelpGuide'

export function DashboardWordmark({ className }: { className?: string }) {
  return (
    <span className={['dashboard-wordmark', className].filter(Boolean).join(' ')}>
      <span className="dashboard-wordmark__accent">KYB</span>BY
    </span>
  )
}

export function LandingHeader({ session, onLogout }: { session: AuthMeResponse | null; onLogout?: () => Promise<void> }) {
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
    <header className={`site-header landing-header landing-page-header${menuOpen ? ' landing-header--open' : ''}`}>
      <div className="landing-page-header__brand">
        <Link to="/" className="brand-mark landing-header__brand landing-header__brand-link" aria-label="KYBBY home" onClick={closeMenu}>
          <span className="brand-mark__text landing-header__brand-text">KYBBY</span>
          <DashboardWordmark className="landing-header__wordmark" />
        </Link>
      </div>

      <div className="landing-page-header__actions">
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
      </div>

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
              войти
            </Link>
            <Link to="/register" className="btn btn-primary" onClick={closeMenu}>
              зарегистрироваться
            </Link>
          </>
        )}
      </nav>
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

export function AuthModalBrand() {
  return (
    <p className="auth-modal-brand" aria-label="KYBBY">
      <span className="auth-modal-brand__accent">KYB</span>BY
    </p>
  )
}

export function AuthScreenShell({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.body.classList.add('page-auth')
    return () => document.body.classList.remove('page-auth')
  }, [])

  return (
    <div className="auth-screen">
      <div className="auth-backdrop-content" aria-hidden="true">
        <h1 className="auth-backdrop-title">
          <span>создайте бренд-стиль</span>
          <span>за минуты</span>
        </h1>
      </div>
      <div className="auth-backdrop-blur" aria-hidden="true" />
      {children}
    </div>
  )
}

export function DemoSidebarNav() {
  return (
    <nav className="dashboard-nav" aria-label="Навигация демо">
      <span className="dashboard-nav__item dashboard-nav__item--active demo-sidebar-nav__item" aria-current="page">
        <span className="dashboard-nav__label">Демо режим</span>
      </span>
    </nav>
  )
}

export function DemoShell({ mainClassName = '', children }: { mainClassName?: string; children: ReactNode }) {
  return (
    <>
      <div className="dashboard-shell demo-shell">
        <aside className="dashboard-sidebar" aria-label="Боковая панель">
          <DemoSidebarNav />
        </aside>
        <main className={`dashboard-main demo-main${mainClassName ? ` ${mainClassName}` : ''}`}>
          {children}
        </main>
      </div>
      <footer className="dashboard-site-footer">
        <div className="dashboard-site-footer__inner">
          <p className="dashboard-site-footer__brand" aria-label="KYBBY">
            <DashboardWordmark />
          </p>
          <p>© 2026 KYBBY. Генерация бренд-комплектов с помощью ИИ.</p>
        </div>
      </footer>
    </>
  )
}

export type DashboardShellActivePath = '/dashboard' | '/profile' | '/generation-history' | '/figma-plugin'

export function DashboardShellNav({
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
        <span className="dashboard-nav__label">Мои проекты</span>
      </Link>
      <Link
        to="/generation-history"
        className={`dashboard-nav__item${activePath === '/generation-history' ? ' dashboard-nav__item--active' : ''}`}
        onClick={onItemNavigate}
      >
        <span className="dashboard-nav__label">История генераций</span>
      </Link>
      <Link to="/figma-plugin" className={`dashboard-nav__item${activePath === '/figma-plugin' ? ' dashboard-nav__item--active' : ''}`} onClick={onItemNavigate}>
        <span className="dashboard-nav__label">Figma-плагин</span>
      </Link>
      <Link to="/profile" className={`dashboard-nav__item${activePath === '/profile' ? ' dashboard-nav__item--active' : ''}`} onClick={onItemNavigate}>
        <span className="dashboard-nav__label">Профиль</span>
      </Link>
      <a href="/logout" className="dashboard-nav__item" onClick={(event) => { onItemNavigate?.(); onLogoutClick(event) }}>
        <span className="dashboard-nav__label">Выход</span>
      </a>
    </nav>
  )
}

export function MigrationShell({
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
  children: ReactNode
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
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
    if (userId == null || activePath !== '/dashboard') return
    if (hasPendingHelpGuide(userId)) {
      setHelpOpen(true)
    }
  }, [userId, activePath])

  const closeHelpGuide = useCallback(() => {
    setHelpOpen(false)
    if (userId != null) clearPendingHelpGuide(userId)
  }, [userId])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMobileNavOpen(false)
        closeHelpGuide()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeHelpGuide])

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
          <Link to="/" className="dashboard-brand dashboard-brand--header" aria-label="KYBBY — на главную">
            <DashboardWordmark />
          </Link>
        </div>
        <div className="dashboard-page-header__actions">
          <div className="dashboard-userbar">
            <button
              type="button"
              className="dashboard-icon-btn dashboard-help-btn"
              aria-label="Краткая инструкция по работе с KYBBY"
              aria-expanded={helpOpen}
              onClick={() => setHelpOpen(true)}
            >
              <DashboardHelpIcon />
            </button>
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
      <DashboardHelpGuide open={helpOpen} onClose={closeHelpGuide} />
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
          {children}
        </main>
      </div>
      <footer className="dashboard-site-footer">
        <div className="dashboard-site-footer__inner">
          <p className="dashboard-site-footer__brand" aria-label="KYBBY">
            <DashboardWordmark />
          </p>
          <p>© 2026 KYBBY. Генерация бренд-комплектов с помощью ИИ.</p>
        </div>
      </footer>
    </div>
  )
}
