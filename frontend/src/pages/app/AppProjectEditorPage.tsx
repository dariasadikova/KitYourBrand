import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchActiveGenerationJob, fetchGenerationJob, startGeneration, cancelGeneration } from '@/api/generations';
import { fetchProjectDetail, resetProjectTokens, saveProjectTokens } from '@/api/projects';
import { legacyProjectResultsUrl } from '@/config/legacyApp';
import type { GenerationJob, GenerationStartPayload } from '@/types/generation';
import type { Project } from '@/types/project';

const TERMINAL_STATUSES = new Set(['completed', 'completed_with_errors', 'failed', 'cancelled']);

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function AppProjectEditorPage() {
  const { slug } = useParams<{ slug: string }>();
  const projectSlug = slug || '';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [tokensText, setTokensText] = useState('{}');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [resetting, setResetting] = useState(false);

  const [generateForm, setGenerateForm] = useState<GenerationStartPayload>({
    logos_count: 1,
    icons_count: 1,
    patterns_count: 1,
    illustrations_count: 1,
    build_style: false,
  });
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const timerRef = useRef<number | null>(null);

  const canCancel = !!job && !TERMINAL_STATUSES.has(job.status);

  const parsedTokens = useMemo(() => {
    try {
      const parsed = JSON.parse(tokensText);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return null;
      }
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }, [tokensText]);

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
        const detail = await fetchProjectDetail(projectSlug);
        setProject(detail.project);
        setTokensText(prettyJson(detail.tokens));

        const active = await fetchActiveGenerationJob(projectSlug);
        if (active) {
          setJob(active);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Не удалось загрузить проект.');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [projectSlug]);

  useEffect(() => {
    if (!job || TERMINAL_STATUSES.has(job.status)) {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    timerRef.current = window.setInterval(() => {
      void (async () => {
        try {
          const fresh = await fetchGenerationJob(job.id);
          setJob(fresh);
          if (TERMINAL_STATUSES.has(fresh.status) && timerRef.current) {
            window.clearInterval(timerRef.current);
            timerRef.current = null;
          }
        } catch (err) {
          setJobError(err instanceof Error ? err.message : 'Не удалось обновить статус задачи.');
        }
      })();
    }, 2000);
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [job]);

  async function onSaveTokens() {
    if (!projectSlug) {
      return;
    }
    if (!parsedTokens) {
      setError('JSON токенов содержит ошибку.');
      return;
    }
    setSaveState('saving');
    setError(null);
    try {
      const saved = await saveProjectTokens(projectSlug, parsedTokens);
      setTokensText(prettyJson(saved));
      setSaveState('saved');
      window.setTimeout(() => setSaveState('idle'), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить токены.');
      setSaveState('idle');
    }
  }

  async function onResetTokens() {
    if (!projectSlug) {
      return;
    }
    setResetting(true);
    setError(null);
    try {
      const tokens = await resetProjectTokens(projectSlug);
      setTokensText(prettyJson(tokens));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сбросить токены.');
    } finally {
      setResetting(false);
    }
  }

  async function onStartGeneration(e: FormEvent) {
    e.preventDefault();
    if (!projectSlug) {
      return;
    }
    if (canCancel) {
      return;
    }
    setStarting(true);
    setJobError(null);
    try {
      const jobId = await startGeneration(projectSlug, generateForm);
      const fresh = await fetchGenerationJob(jobId);
      setJob(fresh);
    } catch (err) {
      setJobError(err instanceof Error ? err.message : 'Не удалось запустить генерацию.');
    } finally {
      setStarting(false);
    }
  }

  async function onCancelGeneration() {
    if (!job) {
      return;
    }
    setCancelling(true);
    setJobError(null);
    try {
      await cancelGeneration(job.id);
      const fresh = await fetchGenerationJob(job.id);
      setJob(fresh);
    } catch (err) {
      setJobError(err instanceof Error ? err.message : 'Не удалось отменить генерацию.');
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return <div className="page-center muted">Загрузка редактора…</div>;
  }

  if (error || !project) {
    return (
      <div className="page">
        <div className="card">
          <div className="error">{error || 'Проект не найден.'}</div>
          <Link className="btn btn-ghost" to="/app/projects">
            К списку проектов
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <h2 style={{ marginTop: 0, marginBottom: '0.25rem' }}>{project.name}</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        slug: <code>{project.slug}</code> | brand_id: <code>{project.brand_id}</code>
      </p>

      {error ? <div className="error">{error}</div> : null}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>Токены проекта (JSON)</h3>
        <textarea
          className="editor-json"
          value={tokensText}
          onChange={(e) => setTokensText(e.target.value)}
          spellCheck={false}
        />
        <div className="btn-row">
          <button type="button" className="btn btn-primary" onClick={() => void onSaveTokens()} disabled={saveState === 'saving'}>
            {saveState === 'saving' ? 'Сохранение…' : saveState === 'saved' ? 'Сохранено' : 'Сохранить'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => void onResetTokens()} disabled={resetting}>
            {resetting ? 'Сброс…' : 'Сбросить к backup'}
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>Запуск генерации</h3>
        <form className="generation-form-grid" onSubmit={(e) => void onStartGeneration(e)}>
          <label>
            Logos
            <input
              type="number"
              min={0}
              value={generateForm.logos_count}
              onChange={(e) => setGenerateForm((p) => ({ ...p, logos_count: Number(e.target.value) || 0 }))}
            />
          </label>
          <label>
            Icons
            <input
              type="number"
              min={0}
              value={generateForm.icons_count}
              onChange={(e) => setGenerateForm((p) => ({ ...p, icons_count: Number(e.target.value) || 0 }))}
            />
          </label>
          <label>
            Patterns
            <input
              type="number"
              min={0}
              value={generateForm.patterns_count}
              onChange={(e) => setGenerateForm((p) => ({ ...p, patterns_count: Number(e.target.value) || 0 }))}
            />
          </label>
          <label>
            Illustrations
            <input
              type="number"
              min={0}
              value={generateForm.illustrations_count}
              onChange={(e) => setGenerateForm((p) => ({ ...p, illustrations_count: Number(e.target.value) || 0 }))}
            />
          </label>
          <label className="generation-form-checkbox">
            <input
              type="checkbox"
              checked={!!generateForm.build_style}
              onChange={(e) => setGenerateForm((p) => ({ ...p, build_style: e.target.checked }))}
            />
            build_style
          </label>
          <div className="btn-row">
            <button type="submit" className="btn btn-primary" disabled={starting || canCancel}>
              {starting ? 'Запуск…' : 'Запустить генерацию'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => void onCancelGeneration()} disabled={!canCancel || cancelling}>
              {cancelling ? 'Отмена…' : 'Отменить'}
            </button>
            <Link className="btn btn-ghost" to={`/app/projects/${encodeURIComponent(project.slug)}/results`}>
              Результаты (React)
            </Link>
            <a className="btn btn-ghost" href={legacyProjectResultsUrl(project.slug)}>
              Результаты (классический UI)
            </a>
          </div>
        </form>
        {jobError ? <div className="error" style={{ marginTop: '0.75rem' }}>{jobError}</div> : null}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Статус задачи</h3>
        {!job ? (
          <p className="muted">Активной задачи нет.</p>
        ) : (
          <>
            <p style={{ marginTop: 0 }}>
              <strong>ID:</strong> <code>{job.id}</code>
            </p>
            <p>
              <strong>Статус:</strong> {job.status} ({job.progress}%)
            </p>
            <p>
              <strong>Сообщение:</strong> {job.message}
            </p>
            <details>
              <summary>Логи ({job.logs.length})</summary>
              <pre className="job-logs">{job.logs.join('\n')}</pre>
            </details>
          </>
        )}
      </div>
    </div>
  );
}
