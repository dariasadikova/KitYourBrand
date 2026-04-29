import { useEffect, useState } from 'react'
import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { getCurrentSession } from './services/authApi'
import type { AuthMeResponse } from './types/auth'

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
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<MigrationShell session={session} />} />
    </Routes>
  )
}

function MigrationShell({ session }: { session: AuthMeResponse | null }) {
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
            <Link to="/dashboard" className="dashboard-nav__item dashboard-nav__item--active">
              <span className="dashboard-nav__icon" aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
                </svg>
              </span>
              <span>Мои проекты</span>
            </Link>
            <a href="/dashboard" className="dashboard-nav__item">
              <span className="dashboard-nav__icon" aria-hidden="true">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
                  <path d="M16 17l5-5-5-5" />
                  <path d="M21 12H9" />
                </svg>
              </span>
              <span>Старый интерфейс</span>
            </a>
          </nav>
        </aside>
        <main className="dashboard-main">
          <section className="dashboard-content">
            <div className="dashboard-head">
              <h1>React frontend</h1>
            </div>
            <div className="dashboard-empty">
              <p>
                Основа React + TypeScript подключена. Текущий рабочий интерфейс пока остаётся на Jinja2 и доступен без изменений.
              </p>
            </div>
          </section>
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

export default App
