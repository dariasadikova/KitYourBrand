import { useCallback, useEffect, useState } from 'react';
import { fetchProjects } from '@/api/projects';
import type { Project } from '@/types/project';

export function AppHomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="page">
      <h2 style={{ marginTop: 0 }}>Проекты</h2>

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
          <p className="muted" style={{ marginBottom: 0 }}>
            В следующем блоке добавим создание проекта и переход в редактор.
          </p>
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
              <p style={{ margin: 0 }}>
                <strong>brand_id:</strong> <code>{project.brand_id}</code>
              </p>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
