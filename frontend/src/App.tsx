import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useParams, useSearchParams } from 'react-router-dom'
import { getCurrentSession, logout } from './services/authApi'
import type { AuthMeResponse } from './types/auth'
import { DemoShell, LandingHeader, MigrationShell } from './components/layout/AppLayout'
import { LandingPage } from './pages/LandingPage'
import { LoginPage, RegisterPage, ForgotPasswordPage, ResetPasswordPage } from './pages/AuthPages'
import { FigmaPluginPage } from './pages/FigmaPluginPage'
import { ProfilePage } from './pages/ProfilePage'
import { GenerationHistoryPage, ProjectEditorPage, ProjectsDashboard, ResultsPage } from './pages/AppPages'

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
      <Route path="/" element={<LandingPage session={session} onLogout={handleLogout} onSessionRefresh={refreshSession} />} />
      <Route path="/login" element={<LoginPage session={session} onSessionChange={setSession} />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/demo/projects/:projectSlug" element={<DemoEditorRoute session={session} />} />
      <Route path="/demo/projects/:projectSlug/results" element={<DemoResultsRoute session={session} />} />
      <Route path="/dashboard" element={<ProtectedDashboard session={session} onLogout={handleLogout} />} />
      <Route path="/profile" element={<ProtectedProfile session={session} onLogout={handleLogout} onSessionRefresh={refreshSession} />} />
      <Route path="/figma-plugin" element={<ProtectedFigmaPlugin session={session} onLogout={handleLogout} />} />
      <Route path="/generation-history" element={<ProtectedGenerationHistory session={session} onLogout={handleLogout} />} />
      <Route path="/projects/:projectSlug" element={<ProtectedEditor session={session} onLogout={handleLogout} />} />
      <Route path="/projects/:projectSlug/results" element={<ProtectedResults session={session} onLogout={handleLogout} />} />
    </Routes>
  )
}

function DemoEditorRoute({ session }: { session: AuthMeResponse | null }) {
  const { projectSlug = '' } = useParams()
  const [searchParams] = useSearchParams()

  if (session === null) return null
  if (session.authenticated) return <Navigate to={`/projects/${projectSlug}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`} replace />

  if (!session.demo_mode) {
    return <Navigate to="/" replace />
  }

  if (session.demo_project_slug && session.demo_project_slug !== projectSlug) {
    return (
      <Navigate
        to={
          session.demo_generation_used
            ? `/demo/projects/${session.demo_project_slug}/results`
            : `/demo/projects/${session.demo_project_slug}`
        }
        replace
      />
    )
  }

  if (session.demo_generation_used) {
    return <Navigate to={`/demo/projects/${projectSlug}/results`} replace />
  }

  return (
    <div className="page-shell page-demo landing-shell">
      <LandingHeader session={session} />
      <DemoShell mainClassName="project-main">
        <ProjectEditorPage projectSlug={projectSlug} isNewProjectFlow={searchParams.get('new') === '1'} isDemoMode />
      </DemoShell>
    </div>
  )
}

function DemoResultsRoute({ session }: { session: AuthMeResponse | null }) {
  const { projectSlug = '' } = useParams()

  if (session === null) return null
  if (session.authenticated) return <Navigate to={`/projects/${projectSlug}/results`} replace />
  if (!session.demo_mode) return <Navigate to="/" replace />
  if (session.demo_project_slug && session.demo_project_slug !== projectSlug) {
    return <Navigate to={`/demo/projects/${session.demo_project_slug}/results`} replace />
  }

  return (
    <div className="page-shell page-demo landing-shell">
      <LandingHeader session={session} />
      <DemoShell mainClassName="results-main">
        <ResultsPage projectSlug={projectSlug} isDemoMode />
      </DemoShell>
    </div>
  )
}

function ProtectedDashboard({ session, onLogout }: { session: AuthMeResponse | null; onLogout: () => Promise<void> }) {
  if (session === null) return null
  if (!session.authenticated) return <Navigate to="/" replace />

  return (
    <MigrationShell session={session} onLogout={onLogout}>
      <ProjectsDashboard />
    </MigrationShell>
  )
}

function ProtectedProfile({ session, onLogout, onSessionRefresh }: { session: AuthMeResponse | null; onLogout: () => Promise<void>; onSessionRefresh: () => Promise<void> }) {
  if (session === null) return null
  if (!session.authenticated) return <Navigate to="/" replace />

  return (
    <MigrationShell session={session} activePath="/profile" mainClassName="profile-main" onLogout={onLogout}>
      <ProfilePage onSessionRefresh={onSessionRefresh} onLogout={onLogout} />
    </MigrationShell>
  )
}

function ProtectedFigmaPlugin({ session, onLogout }: { session: AuthMeResponse | null; onLogout: () => Promise<void> }) {
  if (session === null) return null
  if (!session.authenticated) return <Navigate to="/" replace />

  return (
    <MigrationShell session={session} activePath="/figma-plugin" mainClassName="figma-plugin-main" onLogout={onLogout}>
      <FigmaPluginPage />
    </MigrationShell>
  )
}

function ProtectedGenerationHistory({ session, onLogout }: { session: AuthMeResponse | null; onLogout: () => Promise<void> }) {
  if (session === null) return null
  if (!session.authenticated) return <Navigate to="/" replace />

  return (
    <MigrationShell session={session} activePath="/generation-history" mainClassName="generation-history-main" onLogout={onLogout}>
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

export default App
