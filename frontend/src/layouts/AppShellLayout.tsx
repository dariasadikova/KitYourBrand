import { Outlet, Navigate } from 'react-router-dom'
import { useAuth } from '@/app/AuthContext'

/**
 * Layout-обёртка для авторизованных страниц.
 * Перенаправляет на /login если нет сессии.
 * Реальная разметка (header/sidebar) будет добавлена при переносе dashboard-экранов.
 */
export default function AppShellLayout() {
  const { user, loading } = useAuth()

  if (loading) {
    // Можно заменить на спиннер при переносе экранов
    return null
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
