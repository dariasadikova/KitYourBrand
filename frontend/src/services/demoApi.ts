import { apiClient } from './apiClient'
import type { ProjectSummary } from '../types/project'
import type { DemoLimits } from '../constants/demoMode'

export type DemoStartResponse = {
  ok: boolean
  project: ProjectSummary
  redirect_url: string
  demo_mode: boolean
  demo_limits: DemoLimits
  demo_generation_used?: boolean
  error?: string
}

export function startDemoProject(): Promise<DemoStartResponse> {
  return apiClient<DemoStartResponse>('/api/demo/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
}
