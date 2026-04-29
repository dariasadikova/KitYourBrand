export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export type ProviderStatus =
  | 'pending'
  | 'running'
  | 'done'
  | 'error'
  | 'skipped'

export interface GenerationJob {
  job_id: string
  project_slug: string
  status: JobStatus
  progress: number
  status_text?: string
  log?: string
  error?: string
  error_hint?: string
  providers?: Record<string, ProviderStatus>
  started_at?: string
  finished_at?: string
  duration_seconds?: number
}

export interface GenerationStartResponse {
  ok: boolean
  job_id: string
}

export interface GenerationHistoryItem {
  job_id: string
  project_slug: string
  project_name: string
  db_status: string
  started_at?: string
  duration_seconds?: number
  error_message?: string
  error_hint?: string
  project_deleted: boolean
}

export interface GenerationHistoryStats {
  total: number
  success: number
  failed: number
  avg_duration?: number
}
