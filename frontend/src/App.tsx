import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/app/AuthContext'
import AppShellLayout from '@/layouts/AppShellLayout'

// Заглушки — будут заменяться реальными компонентами по мере переноса экранов
const ComingSoon = ({ name }: { name: string }) => (
  <div style={{ padding: '2rem', fontFamily: 'Inter, sans-serif' }}>
    <h1>{name}</h1>
    <p>Страница в процессе миграции.</p>
  </div>
)

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<ComingSoon name="Login" />} />
        <Route path="/register" element={<ComingSoon name="Register" />} />

        {/* Protected routes — за AppShellLayout */}
        <Route element={<AppShellLayout />}>
          <Route index element={<Navigate to="/projects" replace />} />
          <Route path="/projects" element={<ComingSoon name="Мои проекты" />} />
          <Route path="/projects/:slug/editor" element={<ComingSoon name="Редактор проекта" />} />
          <Route path="/projects/:slug/results" element={<ComingSoon name="Результаты генерации" />} />
          <Route path="/history" element={<ComingSoon name="История генераций" />} />
          <Route path="/profile" element={<ComingSoon name="Профиль" />} />
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/projects" replace />} />
      </Routes>
    </AuthProvider>
  )
}
