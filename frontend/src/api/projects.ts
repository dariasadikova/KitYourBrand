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
