import { api } from './client'
import type { Project, ProjectDetail, TokensSavePayload } from '@/types/project'

export const projectsApi = {
  list: () => api.get<Project[]>('/api/projects'),
  get: (slug: string) => api.get<ProjectDetail>(`/api/projects/${slug}`),
  create: (name: string) => api.post<Project>('/api/projects', { name }),
  saveTokens: (slug: string, tokens: TokensSavePayload) =>
    api.put<{ ok: boolean }>(`/api/projects/${slug}/tokens`, tokens),
  resetTokens: (slug: string) =>
    api.post<{ ok: boolean }>(`/api/projects/${slug}/tokens/reset`),
}
