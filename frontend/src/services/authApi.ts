import { apiClient } from './apiClient'
import type {
  AuthMeResponse,
  ForgotPasswordResponse,
  LoginPayload,
  LoginResponse,
  RegisterPayload,
  ResetPasswordPayload,
} from '../types/auth'

export function getCurrentSession(): Promise<AuthMeResponse> {
  return apiClient<AuthMeResponse>('/api/auth/me')
}

export function login(payload: LoginPayload): Promise<LoginResponse> {
  return apiClient<LoginResponse>('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function register(payload: RegisterPayload): Promise<{ ok: boolean; error?: string }> {
  return apiClient<{ ok: boolean; error?: string }>('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function logout(): Promise<AuthMeResponse> {
  return apiClient<AuthMeResponse>('/api/auth/logout', { method: 'POST' })
}

export function requestPasswordReset(email: string): Promise<ForgotPasswordResponse> {
  return apiClient<ForgotPasswordResponse>('/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
}

export function validatePasswordResetToken(token: string): Promise<{ ok: boolean; valid: boolean }> {
  const params = new URLSearchParams({ token })
  return apiClient<{ ok: boolean; valid: boolean }>(`/api/auth/reset-password/validate?${params}`)
}

export function resetPasswordWithToken(payload: ResetPasswordPayload): Promise<{ ok: boolean; message?: string }> {
  return apiClient<{ ok: boolean; message?: string }>('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}
