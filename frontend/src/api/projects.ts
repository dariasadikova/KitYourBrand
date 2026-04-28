import { apiFetch, readJsonOrThrow } from './client';
import type { Project } from '@/types/project';

type ProjectsResponse = {
  ok: boolean;
  projects: Project[];
};

type CreateProjectResponse = {
  ok: boolean;
  project: Project;
};

type ProjectDetailResponse = {
  ok: boolean;
  project: Project;
  tokens: Record<string, unknown>;
};

type SaveTokensResponse = {
  ok: boolean;
  tokens: Record<string, unknown>;
};

export async function fetchProjects(): Promise<Project[]> {
  const res = await apiFetch('/api/projects');
  const data = await readJsonOrThrow<ProjectsResponse>(res, 'Не удалось загрузить список проектов.');
  return Array.isArray(data.projects) ? data.projects : [];
}

export async function createProject(name: string): Promise<Project> {
  const res = await apiFetch('/api/projects', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  const data = await readJsonOrThrow<CreateProjectResponse>(res, 'Не удалось создать проект.');
  return data.project;
}

export async function fetchProjectDetail(
  slug: string,
): Promise<{ project: Project; tokens: Record<string, unknown> }> {
  const res = await apiFetch(`/api/projects/${encodeURIComponent(slug)}`);
  const data = await readJsonOrThrow<ProjectDetailResponse>(res, 'Не удалось загрузить проект.');
  return {
    project: data.project,
    tokens: data.tokens || {},
  };
}

export async function saveProjectTokens(
  slug: string,
  tokens: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await apiFetch(`/api/projects/${encodeURIComponent(slug)}/tokens`, {
    method: 'PUT',
    body: JSON.stringify(tokens),
  });
  const data = await readJsonOrThrow<SaveTokensResponse>(res, 'Не удалось сохранить проект.');
  return data.tokens;
}

export async function resetProjectTokens(slug: string): Promise<Record<string, unknown>> {
  const res = await apiFetch(`/api/projects/${encodeURIComponent(slug)}/tokens/reset`, {
    method: 'POST',
  });
  const data = await readJsonOrThrow<SaveTokensResponse>(res, 'Не удалось сбросить проект.');
  return data.tokens;
}
