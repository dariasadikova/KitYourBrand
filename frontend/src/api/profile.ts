import { api } from './client'
import type { UserProfile } from '@/types/user'

export const profileApi = {
  get: () => api.get<UserProfile>('/api/profile'),
}
