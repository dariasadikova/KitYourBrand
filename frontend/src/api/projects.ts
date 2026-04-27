import { apiFetch, readJsonOrThrow } from './client';
import type { Project } from '@/types/project';

type ProjectsResponse = {
  ok: boolean;
  projects: Project[];
};

export async function fetchProjects(): Promise<Project[]> {
  const res = await apiFetch('/api/projects');
  const data = await readJsonOrThrow<ProjectsResponse>(res, 'Не удалось загрузить список проектов.');
  return Array.isArray(data.projects) ? data.projects : [];
}
