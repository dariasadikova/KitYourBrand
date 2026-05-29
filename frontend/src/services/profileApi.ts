import { apiClient } from './apiClient'
import type { ProfileResponse } from '../types/profile'

export function getProfile(): Promise<ProfileResponse> {
  return apiClient<ProfileResponse>('/api/profile')
}

export function updateProfile(formData: FormData): Promise<ProfileResponse> {
  return apiClient<ProfileResponse>('/api/profile/update', {
    method: 'POST',
    body: formData,
  })
}

export function deleteAccount(password: string): Promise<{ ok: boolean; message?: string; error?: string }> {
  const formData = new FormData()
  formData.append('password', password)
  return apiClient<{ ok: boolean; message?: string; error?: string }>('/api/profile/delete-account', {
    method: 'POST',
    body: formData,
  })
}
