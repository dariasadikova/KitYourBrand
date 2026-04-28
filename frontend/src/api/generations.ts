import { apiFetch, readJsonOrThrow } from './client';
import type {
  GenerationHistoryRow,
  GenerationHistoryStats,
  GenerationJob,
  GenerationResult,
  GenerationStartPayload,
} from '@/types/generation';

type JobResponse = {
  ok: boolean;
  job: GenerationJob | null;
};

type StartResponse = {
  ok: boolean;
  job_id: string;
};

type CancelResponse = {
  ok: boolean;
};

type ResultResponse = {
  ok: boolean;
  result: GenerationResult;
};

type HistoryResponse = {
  ok: boolean;
  rows: GenerationHistoryRow[];
  stats: GenerationHistoryStats;
  stats_avg_display: string;
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
  has_prev: boolean;
  has_next: boolean;
  prev_page: number;
  next_page: number;
  showing_from: number;
  showing_to: number;
};

type DeleteHistoryResponse = {
  ok: boolean;
  deleted: number;
  skipped: number;
};

export async function fetchGenerationJob(jobId: string): Promise<GenerationJob> {
  const res = await apiFetch(`/api/generations/jobs/${encodeURIComponent(jobId)}`);
  const data = await readJsonOrThrow<JobResponse>(res, 'Не удалось загрузить статус задачи.');
  if (!data.job) {
    throw new Error('Задача не найдена.');
  }
  return data.job;
}

export async function fetchActiveGenerationJob(projectSlug: string): Promise<GenerationJob | null> {
  const res = await apiFetch(`/api/generations/projects/${encodeURIComponent(projectSlug)}/active`);
  const data = await readJsonOrThrow<JobResponse>(res, 'Не удалось получить активную задачу.');
  return data.job ?? null;
}

export async function startGeneration(
  projectSlug: string,
  payload: GenerationStartPayload,
): Promise<string> {
  const res = await apiFetch(`/api/generations/projects/${encodeURIComponent(projectSlug)}/start`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const data = await readJsonOrThrow<StartResponse>(res, 'Не удалось запустить генерацию.');
  return data.job_id;
}

export async function cancelGeneration(jobId: string): Promise<void> {
  const res = await apiFetch(`/api/generations/jobs/${encodeURIComponent(jobId)}/cancel`, {
    method: 'POST',
  });
  await readJsonOrThrow<CancelResponse>(res, 'Не удалось отменить генерацию.');
}

export async function fetchGenerationResults(projectSlug: string): Promise<GenerationResult> {
  const res = await apiFetch(`/api/generations/projects/${encodeURIComponent(projectSlug)}/results`);
  const data = await readJsonOrThrow<ResultResponse>(res, 'Не удалось загрузить результаты генерации.');
  return data.result;
}

export async function fetchGenerationHistory(
  page = 1,
  perPage = 10,
): Promise<HistoryResponse> {
  const qs = new URLSearchParams({
    page: String(page),
    per_page: String(perPage),
  });
  const res = await apiFetch(`/api/generations/history?${qs.toString()}`);
  return readJsonOrThrow<HistoryResponse>(res, 'Не удалось загрузить историю генераций.');
}

export async function deleteGenerationHistorySelected(jobIds: string[]): Promise<DeleteHistoryResponse> {
  const res = await apiFetch('/api/generations/history/delete-selected', {
    method: 'POST',
    body: JSON.stringify({ job_ids: jobIds }),
  });
  return readJsonOrThrow<DeleteHistoryResponse>(res, 'Не удалось удалить выбранные записи.');
}

export async function clearGenerationHistory(): Promise<DeleteHistoryResponse> {
  const res = await apiFetch('/api/generations/history/clear', { method: 'POST' });
  return readJsonOrThrow<DeleteHistoryResponse>(res, 'Не удалось очистить историю генераций.');
}
