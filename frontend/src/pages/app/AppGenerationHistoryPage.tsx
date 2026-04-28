import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  clearGenerationHistory,
  deleteGenerationHistorySelected,
  fetchGenerationHistory,
} from '@/api/generations';
import type { GenerationHistoryRow } from '@/types/generation';

export function AppGenerationHistoryPage() {
  const [rows, setRows] = useState<GenerationHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [deleting, setDeleting] = useState(false);

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([k]) => k),
    [selected],
  );

  const load = useCallback(async (targetPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchGenerationHistory(targetPage, 10);
      setRows(data.rows);
      setPage(data.page);
      setTotalPages(data.total_pages);
      setTotal(data.total);
      setSelected({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить историю.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(1);
  }, [load]);

  async function onDeleteSelected() {
    if (!selectedIds.length) {
      return;
    }
    setDeleting(true);
    setError(null);
    try {
      await deleteGenerationHistorySelected(selectedIds);
      await load(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить выбранные записи.');
    } finally {
      setDeleting(false);
    }
  }

  async function onClearAll() {
    setDeleting(true);
    setError(null);
    try {
      await clearGenerationHistory();
      await load(1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось очистить историю.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="page">
      <h2 style={{ marginTop: 0, marginBottom: '0.25rem' }}>История генераций</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Всего записей: {total}
      </p>

      <div className="btn-row" style={{ marginBottom: '1rem' }}>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!selectedIds.length || deleting}
          onClick={() => void onDeleteSelected()}
        >
          Удалить выбранные ({selectedIds.length})
        </button>
        <button type="button" className="btn btn-ghost" disabled={deleting || !rows.length} onClick={() => void onClearAll()}>
          Очистить историю
        </button>
      </div>

      {loading ? <p className="muted">Загрузка…</p> : null}
      {error ? <div className="error">{error}</div> : null}

      {!loading && !error && rows.length === 0 ? (
        <div className="card">
          <p style={{ margin: 0 }}>История пока пустая.</p>
        </div>
      ) : null}

      {!loading && !error && rows.length > 0 ? (
        <div className="history-table-wrap">
          <table className="history-table">
            <thead>
              <tr>
                <th />
                <th>Проект</th>
                <th>Статус</th>
                <th>Старт</th>
                <th>Длительность</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.job_id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={!!selected[row.job_id]}
                      onChange={(e) =>
                        setSelected((prev) => ({
                          ...prev,
                          [row.job_id]: e.target.checked,
                        }))
                      }
                    />
                  </td>
                  <td>
                    <strong>{row.project_name}</strong>
                    <div className="muted">{row.project_slug}</div>
                  </td>
                  <td>
                    <span className={`status-pill status-${row.status_key}`}>{row.status_key}</span>
                    {row.error_message ? <div className="error-inline">{row.error_message}</div> : null}
                  </td>
                  <td>{row.started_display}</td>
                  <td>{row.duration_display}</td>
                  <td>
                    <div className="history-actions">
                      <Link className="btn btn-ghost" to={`/app/projects/${encodeURIComponent(row.project_slug)}/editor`}>
                        Редактор
                      </Link>
                      <Link className="btn btn-ghost" to={`/app/projects/${encodeURIComponent(row.project_slug)}/results`}>
                        Результаты
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="btn-row" style={{ marginTop: '1rem' }}>
        <button type="button" className="btn btn-ghost" disabled={page <= 1} onClick={() => void load(page - 1)}>
          Назад
        </button>
        <span className="muted" style={{ alignSelf: 'center' }}>
          Страница {page} из {Math.max(totalPages, 1)}
        </span>
        <button type="button" className="btn btn-ghost" disabled={page >= totalPages} onClick={() => void load(page + 1)}>
          Далее
        </button>
      </div>
    </div>
  );
}
