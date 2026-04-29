import { api } from './client'
import type { User } from '@/types/user'

export interface LoginPayload {
  email: string
  password: string
}

export interface RegisterPayload {
  name: string
  email: string
  password: string
  password_confirm: string
}

export interface AuthResult {
  ok: boolean
  user?: User
  error?: string
}

export const authApi = {
  me: () => api.get<User>('/api/auth/me'),
  login: (payload: LoginPayload) => api.post<AuthResult>('/api/auth/login', payload),
  register: (payload: RegisterPayload) => api.post<AuthResult>('/api/auth/register', payload),
  logout: () => api.post<void>('/api/auth/logout'),
}
