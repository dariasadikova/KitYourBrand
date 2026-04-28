import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchGenerationResults } from '@/api/generations';
import { fetchProjectDetail } from '@/api/projects';
import type { GenerationAsset, GenerationResult } from '@/types/generation';
import type { Project } from '@/types/project';

type AssetSectionProps = {
  title: string;
  items: GenerationAsset[];
};

function AssetSection({ title, items }: AssetSectionProps) {
  return (
    <section className="card" style={{ marginBottom: '1rem' }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      {items.length === 0 ? (
        <p className="muted" style={{ marginBottom: 0 }}>
          Пока пусто
        </p>
      ) : (
        <div className="asset-grid">
          {items.map((asset, idx) => (
            <article className="asset-card" key={`${asset.provider}-${asset.filename}-${idx}`}>
              <img src={asset.url} alt={asset.name || asset.filename} loading="lazy" />
              <div className="asset-meta">
                <strong>{asset.name || asset.filename}</strong>
                <span className="muted">{asset.provider}</span>
                <a href={asset.url} target="_blank" rel="noreferrer">
                  Открыть
                </a>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function AppProjectResultsPage() {
  const { slug } = useParams<{ slug: string }>();
  const projectSlug = slug || '';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [result, setResult] = useState<GenerationResult | null>(null);

  useEffect(() => {
    async function load() {
      if (!projectSlug) {
        setError('Не указан slug проекта.');
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const [detail, generationResult] = await Promise.all([
          fetchProjectDetail(projectSlug),
          fetchGenerationResults(projectSlug),
        ]);
        setProject(detail.project);
        setResult(generationResult);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Не удалось загрузить результаты.');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [projectSlug]);

  if (loading) {
    return <div className="page-center muted">Загрузка результатов…</div>;
  }

  if (error || !project || !result) {
    return (
      <div className="page">
        <div className="card">
          <div className="error">{error || 'Результаты не найдены.'}</div>
          <Link className="btn btn-ghost" to="/app/projects">
            К списку проектов
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <h2 style={{ marginTop: 0, marginBottom: '0.25rem' }}>Результаты: {project.name}</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        brand_id: <code>{result.brand_id}</code>
      </p>
      <div className="btn-row" style={{ marginBottom: '1rem' }}>
        <Link className="btn btn-ghost" to={`/app/projects/${encodeURIComponent(project.slug)}/editor`}>
          Назад в редактор
        </Link>
      </div>

      <AssetSection title="Logos" items={result.logos} />
      <AssetSection title="Icons" items={result.icons} />
      <AssetSection title="Patterns" items={result.patterns} />
      <AssetSection title="Illustrations" items={result.illustrations} />
    </div>
  );
}
