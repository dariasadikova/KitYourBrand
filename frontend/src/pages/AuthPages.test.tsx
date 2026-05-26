import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { LoginResponse } from '../types/auth'
import { LoginPage } from './AuthPages'
import { login } from '../services/authApi'

vi.mock('../services/authApi', () => ({
  login: vi.fn(),
  register: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPasswordWithToken: vi.fn(),
  validatePasswordResetToken: vi.fn(),
}))

const loginMock = vi.mocked(login)

function renderLoginPage(onSessionChange = vi.fn()) {
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage session={{ ok: true, authenticated: false, user: null }} onSessionChange={onSessionChange} />} />
        <Route path="/dashboard" element={<div>Dashboard route</div>} />
        <Route path="/projects/:projectSlug" element={<div>Editor route</div>} />
      </Routes>
    </MemoryRouter>,
  )
  return { onSessionChange }
}

describe('LoginPage', () => {
  beforeEach(() => {
    loginMock.mockReset()
  })

  it('submits credentials, stores session, and navigates to dashboard', async () => {
    const session: LoginResponse = {
      ok: true,
      authenticated: true,
      user: { id: 1, name: 'Daria', email: 'daria@example.com' },
    }
    loginMock.mockResolvedValue(session)
    const { onSessionChange } = renderLoginPage()
    const user = userEvent.setup()

    await user.type(screen.getByPlaceholderText('Почта'), 'daria@example.com')
    await user.type(screen.getByPlaceholderText('Пароль'), 'strongpass123')
    await user.click(screen.getByRole('button', { name: 'Войти' }))

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith({ email: 'daria@example.com', password: 'strongpass123' })
      expect(onSessionChange).toHaveBeenCalledWith(session)
      expect(screen.getByText('Dashboard route')).toBeInTheDocument()
    })
  })

  it('shows API errors without navigating away', async () => {
    loginMock.mockRejectedValue(new Error('Неверный email или пароль.'))
    renderLoginPage()
    const user = userEvent.setup()

    await user.type(screen.getByPlaceholderText('Почта'), 'bad@example.com')
    await user.type(screen.getByPlaceholderText('Пароль'), 'wrongpass')
    await user.click(screen.getByRole('button', { name: 'Войти' }))

    expect(await screen.findByText('Неверный email или пароль.')).toBeInTheDocument()
    expect(screen.queryByText('Dashboard route')).not.toBeInTheDocument()
  })

  it('redirects to a claimed demo project editor when backend returns one', async () => {
    loginMock.mockResolvedValue({
      ok: true,
      authenticated: true,
      user: { id: 1, name: 'Daria', email: 'daria@example.com' },
      claimed_demo_project: {
        slug: 'demo-brand',
        name: 'Demo Brand',
        editor_url: '/app/projects/demo-brand',
        results_url: '/app/projects/demo-brand/results',
      },
    })
    renderLoginPage()
    const user = userEvent.setup()

    await user.type(screen.getByPlaceholderText('Почта'), 'daria@example.com')
    await user.type(screen.getByPlaceholderText('Пароль'), 'strongpass123')
    await user.click(screen.getByRole('button', { name: 'Войти' }))

    expect(await screen.findByText('Editor route')).toBeInTheDocument()
  })
})
