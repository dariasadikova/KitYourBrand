import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createProject, fetchProjects } from '@/api/projects';
import type { Project } from '@/types/project';

export function AppHomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await fetchProjects();
      setProjects(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить список проектов.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreateProject(e: FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      const name = newProjectName.trim() || 'Новый проект';
      const created = await createProject(name);
      setProjects((prev) => [created, ...prev]);
      setNewProjectName('');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Не удалось создать проект.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="page">
      <h2 style={{ marginTop: 0 }}>Проекты</h2>
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>Создать проект</h3>
        {createError ? <div className="error">{createError}</div> : null}
        <form className="create-project-form" onSubmit={(e) => void onCreateProject(e)}>
          <input
            type="text"
            placeholder="Название проекта"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            maxLength={120}
          />
          <button type="submit" className="btn btn-primary" disabled={creating}>
            {creating ? 'Создание…' : 'Создать'}
          </button>
        </form>
      </div>

      {loading ? <p className="muted">Загрузка проектов…</p> : null}

      {!loading && error ? (
        <div className="card">
          <div className="error" style={{ marginBottom: '0.75rem' }}>
            {error}
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => void load()}>
            Повторить
          </button>
        </div>
      ) : null}

      {!loading && !error && projects.length === 0 ? (
        <div className="card">
          <p style={{ marginTop: 0 }}>У вас пока нет проектов.</p>
          <p className="muted" style={{ marginBottom: 0 }}>Создайте первый проект через форму выше.</p>
        </div>
      ) : null}

      {!loading && !error && projects.length > 0 ? (
        <div className="projects-list">
          {projects.map((project) => (
            <article key={project.id} className="card">
              <h3 style={{ marginTop: 0, marginBottom: '0.25rem' }}>{project.name}</h3>
              <p className="muted" style={{ marginTop: 0, marginBottom: '0.75rem' }}>
                slug: <code>{project.slug}</code>
              </p>
              <p style={{ margin: 0, marginBottom: '0.75rem' }}>
                <strong>brand_id:</strong> <code>{project.brand_id}</code>
              </p>
              <div className="project-actions">
                <Link className="btn btn-primary" to={`/app/projects/${encodeURIComponent(project.slug)}/editor`}>
                  Редактор (React)
                </Link>
                <Link className="btn btn-ghost" to={`/app/projects/${encodeURIComponent(project.slug)}/results`}>
                  Результаты (React)
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
