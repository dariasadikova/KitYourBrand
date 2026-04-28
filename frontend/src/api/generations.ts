import { apiFetch, readJsonOrThrow } from './client';
import type { GenerationJob, GenerationStartPayload } from '@/types/generation';

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
