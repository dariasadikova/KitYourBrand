import { api } from './client'
import type { GenerationJob, GenerationHistoryItem, GenerationStartResponse } from '@/types/generation'

export const generationsApi = {
  startGeneration: (slug: string) =>
    api.post<GenerationStartResponse>(`/api/generations/projects/${slug}/start`),
  getJob: (jobId: string) =>
    api.get<GenerationJob>(`/api/generations/jobs/${jobId}`),
  cancelJob: (jobId: string) =>
    api.post<{ ok: boolean }>(`/api/generations/jobs/${jobId}/cancel`),
  getActiveJob: (slug: string) =>
    api.get<GenerationJob | null>(`/api/generations/projects/${slug}/active`),
  getHistory: () =>
    api.get<{ rows: GenerationHistoryItem[]; total: number }>('/api/generations/history'),
  deleteSelected: (jobIds: string[]) =>
    api.post<{ ok: boolean; deleted: number; skipped: number }>(
      '/api/generations/history/delete-selected',
      { job_ids: jobIds },
    ),
  clearHistory: () =>
    api.post<{ ok: boolean; deleted: number; skipped: number }>(
      '/api/generations/history/clear',
    ),
}
