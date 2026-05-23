import { apiClient } from './apiClient'
import type { CreateProjectResponse, ImportProjectResponse, ProjectsListResponse } from '../types/project'

export function listProjects(): Promise<ProjectsListResponse> {
  return apiClient<ProjectsListResponse>('/api/projects')
}

export function createProject(name = 'Новый проект'): Promise<CreateProjectResponse> {
  return apiClient<CreateProjectResponse>('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
}

export function importProjectBundle(file: File): Promise<ImportProjectResponse> {
  const formData = new FormData()
  formData.append('file', file)
  return apiClient<ImportProjectResponse>('/api/projects/import-bundle', {
    method: 'POST',
    body: formData,
  })
}

export function deleteProject(projectSlug: string): Promise<{ ok: boolean }> {
  return apiClient<{ ok: boolean }>(`/api/projects/${projectSlug}/delete`, { method: 'POST' })
}

export function restoreProject(projectSlug: string): Promise<{ ok: boolean }> {
  return apiClient<{ ok: boolean }>(`/api/projects/${projectSlug}/restore`, { method: 'POST' })
}
