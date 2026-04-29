import { apiClient } from './apiClient'
import type { AuthMeResponse } from '../types/auth'

export function getCurrentSession(): Promise<AuthMeResponse> {
  return apiClient<AuthMeResponse>('/api/auth/me')
}
