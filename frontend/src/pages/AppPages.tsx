import {
  type ChangeEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { cancelGenerationJob, deleteGenerationHistorySelected, getGenerationHistory } from '../services/generationHistoryApi'
import { createProject, deleteProject, importProjectBundle, listProjects, restoreProject } from '../services/projectsApi'
import {
  deleteProjectEditorRef,
  getProjectEditor,
  resetProjectEditor,
  saveProjectEditor,
  startProjectGeneration,
  suggestProjectPalette,
  uploadProjectEditorRefs,
} from '../services/editorApi'
import {
  cancelGenerationJob as cancelResultsGenerationJob,
  generateFigmaManifest,
  getActiveGenerationJob,
  getGenerationJob,
  getProjectResults,
} from '../services/resultsApi'
import type { GenerationHistoryResponse, GenerationHistoryRow } from '../types/generationHistory'
import type { ProjectSummary } from '../types/project'
import type { GenerationJob, ProjectResultsResponse, ResultAsset } from '../types/results'
import {
  CopyIcon,
  DemoTabLockIcon,
  ProjectCardDeleteIcon,
  ProjectCardEditIcon,
} from '../components/icons'
import { BrandMockupsPreview } from '../components/mockups/BrandMockupsPreview'
import { DEMO_ASSET_COUNTS, DEMO_MAX_REFERENCES, DEMO_PALETTE_KEYS, DEMO_PROVIDER_LABEL } from '../constants/demoMode'
import { GENERATION_PROVIDERS } from '../constants/generationProviders'
import type { PaletteVariant, PaletteVariantName, ProjectEditorResponse, ProjectTokens } from '../types/editor'
import {
  activeProviderSlug,
  generationProviderEntries,
  isGenerationLogErrorLine,
  normalizeProviderStatus,
  providerStatusLabel,
} from '../lib/generation'
import {
  ASSET_LABELS,
  ASSET_PLACEHOLDERS,
  ASSET_REF_LABELS,
  ASSET_TYPES,
  type AssetType,
  assetCountLabel,
  clampAssetCount,
  DEFAULT_ASSET_COUNTS,
  DEFAULT_PALETTE,
  expandPromptFieldForCount,
  getActivePaletteKeys,
  getAssetCounts,
  getGenerationProviderSlugsFromTokens,
  getNestedTokenBoolean,
  getNestedTokenNumber,
  getNestedTokenString,
  getPaletteSlots,
  getTokenRecord,
  getTokenString,
  illustrationFormatFromTokens,
  normalizeHexColor,
  normalizeStyleRefs,
  PALETTE_KEYS,
  PALETTE_LABELS,
  type PaletteKey,
  referencesToAssetRefs,
  type StyleRef,
  tokensToPromptFields,
} from '../lib/tokens'

export function GenerationHistoryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialPage = Number(searchParams.get('page') || '1')
  const [history, setHistory] = useState<GenerationHistoryResponse | null>(null)
  const [selectedJobIds, setSelectedJobIds] = useState<string[]>([])
  const [statsOpen, setStatsOpen] = useState(false)
  const [errorRow, setErrorRow] = useState<GenerationHistoryRow | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [isDeletingSelected, setIsDeletingSelected] = useState(false)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  async function loadHistory(page = initialPage) {
    setIsLoading(true)
    setError('')
    try {
      const payload = await getGenerationHistory(page)
      setHistory(payload)
      setSelectedJobIds([])
      setSearchParams(page > 1 ? { page: String(page) } : {})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить историю генераций.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadHistory(initialPage)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!statsOpen && !errorRow) return
    document.body.classList.add('generation-history-modal-open')
    return () => document.body.classList.remove('generation-history-modal-open')
  }, [statsOpen, errorRow])

  const rows = history?.rows || []
  const selectableRows = rows.filter((row) => row.status_key !== 'running')
  const allSelected = selectableRows.length > 0 && selectedJobIds.length === selectableRows.length
  const partiallySelected = selectedJobIds.length > 0 && selectedJobIds.length < selectableRows.length

  function toggleSelectAll(checked: boolean) {
    setSelectedJobIds(checked ? selectableRows.map((row) => row.job_id) : [])
  }

  function toggleRow(jobId: string, checked: boolean) {
    setSelectedJobIds((items) => (
      checked ? [...items, jobId] : items.filter((item) => item !== jobId)
    ))
  }

  async function handleDeleteSelected() {
    if (!selectedJobIds.length) return
    setDeleteConfirmOpen(true)
  }

  async function confirmDeleteSelected() {
    if (!selectedJobIds.length || isDeletingSelected) return
    setIsDeletingSelected(true)
    try {
      await deleteGenerationHistorySelected(selectedJobIds)
      setDeleteConfirmOpen(false)
      await loadHistory(history?.page || 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить выбранные записи.')
    } finally {
      setIsDeletingSelected(false)
    }
  }

  async function handleCancel(jobId: string) {
    try {
      await cancelGenerationJob(jobId)
      window.setTimeout(() => loadHistory(history?.page || 1), 700)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось прервать генерацию.')
    }
  }

  async function handleRestoreProject(projectSlug: string) {
    setError('')
    try {
      await restoreProject(projectSlug)
      await loadHistory(history?.page || 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось восстановить проект.')
    }
  }

  const historyErrBody = errorRow ? String(errorRow.error_message || '').trim() : ''
  const historyErrHint = errorRow ? String(errorRow.error_hint || '').trim() : ''
  const historyErrShowHint = Boolean(errorRow && historyErrHint && !historyErrBody.includes(historyErrHint))

  return (
    <section className="dashboard-content generation-history-page">
      <div className="dashboard-head generation-history-head">
        <div>
          <div className="generation-history-title-row">
            <h1>История генераций</h1>
            <button type="button" className="generation-history-info-btn" aria-label="Открыть статистику" onClick={() => setStatsOpen(true)}>i</button>
          </div>
          <p className="generation-history-subtitle">Просмотр всех запусков генерации бренд-комплектов</p>
        </div>
      </div>

      <div className="generation-history-table-wrap">
        <p className="generation-history-table-hint">Подсказка: нажмите на статус <strong>Ошибка</strong>, чтобы посмотреть подробности причины.</p>
        {error ? <div className="profile-alert profile-alert--error">{error}</div> : null}

        {isLoading ? (
          <p className="generation-history-empty">Загружаем историю генераций...</p>
        ) : rows.length > 0 ? (
          <>
            <div className="generation-history-bulk-actions">
              <label className="generation-history-select-all">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(node) => {
                    if (node) node.indeterminate = partiallySelected
                  }}
                  onChange={(event) => toggleSelectAll(event.target.checked)}
                />
                <span>Выбрать всё</span>
              </label>
              <div className="generation-history-bulk-actions__buttons">
                <button type="button" className="btn btn-outline btn-inline" disabled={!selectedJobIds.length} onClick={handleDeleteSelected}>Удалить</button>
              </div>
            </div>
            <div className="generation-history-table-scroll">
              <table className="generation-history-table">
                <thead>
                  <tr>
                    <th scope="col" className="generation-history-table__select-col"></th>
                    <th scope="col">Дата</th>
                    <th scope="col">Проект</th>
                    <th scope="col">Статус</th>
                    <th scope="col">Время выполнения</th>
                    <th scope="col">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.job_id}>
                      <td className="generation-history-table__select-col">
                        <input
                          type="checkbox"
                          className="generation-history-row-select"
                          value={row.job_id}
                          disabled={row.status_key === 'running'}
                          title={row.status_key === 'running' ? 'Нельзя удалять активную генерацию' : undefined}
                          checked={selectedJobIds.includes(row.job_id)}
                          onChange={(event) => toggleRow(row.job_id, event.target.checked)}
                        />
                      </td>
                      <td className="generation-history-table__date">{row.started_display}</td>
                      <td className="generation-history-table__project">
                        <span className="generation-history-table__project-inner">
                          {row.project_name}
                        </span>
                      </td>
                      <td>{renderHistoryStatus(row, setErrorRow)}</td>
                      <td className="generation-history-table__duration">{row.duration_display}</td>
                      <td className="generation-history-table__actions">{renderHistoryAction(row, handleCancel, handleRestoreProject)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="generation-history-footer">
              <p className="generation-history-footer__meta">
                Показано {history?.showing_from}–{history?.showing_to} из {history?.total} генераций
              </p>
              <nav className="generation-history-pagination" aria-label="Страницы списка генераций">
                {history?.has_prev ? (
                  <button type="button" className="btn btn-outline btn-inline generation-history-page-link" onClick={() => loadHistory(history.prev_page)}>Предыдущая</button>
                ) : (
                  <span className="generation-history-page-link generation-history-page-link--disabled">Предыдущая</span>
                )}
                <span className="generation-history-page-current">{history?.page}</span>
                {history?.has_next ? (
                  <button type="button" className="btn btn-outline btn-inline generation-history-page-link" onClick={() => loadHistory(history.next_page)}>Следующая</button>
                ) : (
                  <span className="generation-history-page-link generation-history-page-link--disabled">Следующая</span>
                )}
              </nav>
            </div>
          </>
        ) : (
          <p className="generation-history-empty">Пока нет записей о генерациях. Запустите генерацию в редакторе проекта.</p>
        )}
      </div>

      {statsOpen && history
        ? dashboardOverlayPortal(
          <div className="generation-history-modal">
            <div className="generation-history-modal__backdrop" onClick={() => setStatsOpen(false)}></div>
            <div className="generation-history-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="generation-history-stats-title">
              <button type="button" className="generation-history-modal__close" aria-label="Закрыть статистику" onClick={() => setStatsOpen(false)}>×</button>
              <h2 id="generation-history-stats-title">Статистика генераций</h2>
              <div className="generation-history-stats generation-history-stats--modal">
                <HistoryStatCard label="Генераций всего" value={String(history.stats.total)} />
                <HistoryStatCard label="Успешных генераций" value={String(history.stats.successful)} />
                <HistoryStatCard label="Среднее время" value={history.stats_avg_display} />
                <HistoryStatCard label="Проектов" value={String(history.stats.projects_with_generations)} />
              </div>
            </div>
          </div>
        ) : null}

      {errorRow ? (
        <div className="generation-history-modal">
          <div className="generation-history-modal__backdrop" onClick={() => setErrorRow(null)}></div>
          <div className="generation-history-modal__dialog" role="alertdialog" aria-modal="true" aria-labelledby="generation-history-error-title">
            <button type="button" className="generation-history-modal__close" aria-label="Закрыть" onClick={() => setErrorRow(null)}>×</button>
            <h2 id="generation-history-error-title">Ошибка генерации</h2>
            <p className="generation-history-error-body">
              {historyErrBody
                || 'Текст ошибки не был сохранён (часто так бывает у старых записей или после сбоя). Откройте проект и при необходимости запустите генерацию снова.'}
            </p>
            {historyErrShowHint ? <p className="generation-history-error-hint">{historyErrHint}</p> : null}
            <div className="generation-history-modal__actions">
              <button type="button" className="btn btn-primary btn-inline" onClick={() => setErrorRow(null)}>Ок</button>
            </div>
          </div>
        </div>
      ) : null}
      <AppConfirmModal
        open={deleteConfirmOpen}
        message={`Удалить выбранные записи (${selectedJobIds.length}) из истории генераций?`}
        confirmLabel="Ок"
        cancelLabel="Отмена"
        isBusy={isDeletingSelected}
        onConfirm={() => void confirmDeleteSelected()}
        onCancel={() => {
          if (!isDeletingSelected) setDeleteConfirmOpen(false)
        }}
      />
    </section>
  )
}

function renderHistoryStatus(row: GenerationHistoryRow, openError: (row: GenerationHistoryRow) => void) {
  if (row.status_key === 'success') {
    return <span className="generation-history-pill generation-history-pill--success">Успешно</span>
  }
  if (row.status_key === 'running') {
    return <span className="generation-history-pill generation-history-pill--running">В процессе</span>
  }
  return (
    <button
      type="button"
      className="generation-history-pill generation-history-pill--error generation-history-pill-button"
      title="Нажмите, чтобы открыть подробности ошибки"
      onClick={() => openError(row)}
    >
      Ошибка
    </button>
  )
}

function renderHistoryAction(
  row: GenerationHistoryRow,
  cancel: (jobId: string) => void,
  restoreProjectSlug: (slug: string) => void,
) {
  if (row.action === 'cancel') {
    return (
      <button type="button" className="btn btn-outline btn-inline generation-history-action-btn generation-history-btn-cancel" onClick={() => cancel(row.job_id)}>
        Прервать
      </button>
    )
  }
  if (row.action === 'open') {
    return <Link className="btn btn-primary btn-inline generation-history-action-btn" to={`/projects/${row.project_slug}/results?job=${encodeURIComponent(row.job_id)}`}>Открыть</Link>
  }
  if (row.action === 'restore') {
    return (
      <button
        type="button"
        className="btn btn-inline generation-history-action-btn generation-history-btn-restore"
        onClick={() => restoreProjectSlug(row.project_slug)}
      >
        Восстановить
      </button>
    )
  }
  return <Link className="btn btn-outline btn-inline generation-history-action-btn generation-history-btn-repeat" to={`/projects/${row.project_slug}`}>Повторить</Link>
}

function HistoryStatCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="generation-history-stat-card">
      <span className="generation-history-stat-card__label">{label}</span>
      <strong className="generation-history-stat-card__value">{value}</strong>
    </article>
  )
}

function resolveAppPublicUrl(path: string): string {
  if (!path) return ''
  if (/^https?:\/\//i.test(path)) return path
  if (typeof window === 'undefined') return path
  return `${window.location.origin}${path.startsWith('/') ? path : `/${path}`}`
}

function ResultsFigmaImportGuide({ brandId }: { brandId: string }) {
  const [brandCopyHint, setBrandCopyHint] = useState('')
  const [addressCopyHint, setAddressCopyHint] = useState('')
  const kybbAddress = typeof window !== 'undefined' ? window.location.origin : ''

  async function copyBrandId() {
    try {
      await navigator.clipboard.writeText(brandId)
      setBrandCopyHint('Скопировано')
      window.setTimeout(() => setBrandCopyHint(''), 2000)
    } catch {
      setBrandCopyHint('Не удалось скопировать')
    }
  }

  async function copyKybbAddress() {
    try {
      await navigator.clipboard.writeText(kybbAddress)
      setAddressCopyHint('Скопировано')
      window.setTimeout(() => setAddressCopyHint(''), 2000)
    } catch {
      setAddressCopyHint('Не удалось скопировать')
    }
  }

  return (
    <div className="results-figma-guide">
      <p className="results-figma-guide__lead">
        Для переноса в Figma сначала установите плагин KYBBY —{' '}
        <Link to="/figma-plugin">инструкция в разделе «Figma-плагин»</Link>.
      </p>
      <dl className="results-figma-guide__params">
        <div className="results-figma-guide__param">
          <dt>Brand ID этого проекта</dt>
          <dd>
            <div className="results-figma-guide__copy-field">
              <code className="results-figma-guide__copy-field-value">{brandId}</code>
              <button
                type="button"
                className="results-figma-guide__copy-btn"
                aria-label="Копировать Brand ID"
                title="Копировать"
                onClick={() => void copyBrandId()}
              >
                <CopyIcon />
              </button>
            </div>
            {brandCopyHint ? <span className="results-figma-guide__copy-hint">{brandCopyHint}</span> : null}
          </dd>
        </div>
        <div className="results-figma-guide__param">
          <dt>Адрес KYBBY</dt>
          <dd>
            <div className="results-figma-guide__copy-field">
              <code className="results-figma-guide__copy-field-value">{kybbAddress}</code>
              <button
                type="button"
                className="results-figma-guide__copy-btn"
                aria-label="Копировать адрес KYBBY"
                title="Копировать"
                onClick={() => void copyKybbAddress()}
              >
                <CopyIcon />
              </button>
            </div>
            {addressCopyHint ? <span className="results-figma-guide__copy-hint">{addressCopyHint}</span> : null}
          </dd>
        </div>
      </dl>
      <ol className="results-figma-guide__steps">
        <li>Нажмите «Экспорт бренд-комплекта» на этой странице.</li>
        <li>Откройте плагин KYBBY в Figma и вставьте Brand ID и адрес KYBBY.</li>
        <li>Выберите провайдера и нажмите Import.</li>
      </ol>
    </div>
  )
}

export function ResultsPage({
  projectSlug,
  isDemoMode = false,
}: {
  projectSlug: string
  isDemoMode?: boolean
}) {
  const [searchParams] = useSearchParams()
  const selectedJobId = searchParams.get('job')?.trim() || ''
  const [results, setResults] = useState<ProjectResultsResponse | null>(null)
  const [job, setJob] = useState<GenerationJob | null>(null)
  const [manifestUrl, setManifestUrl] = useState('')
  const [exportStatus, setExportStatus] = useState('')
  const [exportTone, setExportTone] = useState<'loading' | 'success' | 'error' | ''>('')
  const [isExporting, setIsExporting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [cancelRequested, setCancelRequested] = useState(false)

  useEffect(() => {
    let alive = true
    setIsLoading(true)
    setError('')
    setJob(null)

    getProjectResults(projectSlug, selectedJobId)
      .then((payload) => {
        if (!alive) return
        setResults(payload)
        setIsLoading(false)

        const activeJobId = payload.active_generation_job_id
        if (activeJobId) {
          void pollResultsJob(activeJobId)
          return
        }

        void getActiveGenerationJob(projectSlug)
          .then((active) => {
            if (alive && active?.job?.id) {
              void pollResultsJob(active.job.id)
            }
          })
          .catch(() => null)
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : 'Не удалось загрузить результаты генерации.')
        if (alive) setIsLoading(false)
      })

    async function pollResultsJob(jobId: string) {
      setCancelRequested(false)
      while (alive) {
        const payload = await getGenerationJob(jobId).catch(() => null)
        if (!payload?.ok || !payload.job) break
        setJob(payload.job)
        const terminal = ['completed', 'failed', 'cancelled', 'completed_with_errors'].includes(String(payload.job.status || ''))
        if (terminal) {
          const refreshed = await getProjectResults(projectSlug, selectedJobId).catch(() => null)
          if (alive && refreshed) setResults(refreshed)
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }

    return () => {
      alive = false
    }
  }, [projectSlug, selectedJobId])

  async function handleGenerateFigma() {
    if (!results) return
    const jobIdForExport = results.selected_generation_job_id?.trim() || ''
    setManifestUrl('')
    setIsExporting(true)
    setExportStatus(jobIdForExport ? 'Подготовка manifest для выбранной версии…' : 'Подготовка manifest…')
    setExportTone('loading')

    try {
      const payload = await generateFigmaManifest(projectSlug, results.project.brand_id, jobIdForExport || undefined)
      setManifestUrl(payload.download_url || payload.manifest_url || '')
      setExportStatus('Экспорт готов. Скопируйте Brand ID и импортируйте проект через плагин Figma.')
      setExportTone('success')
      window.setTimeout(() => setIsExporting(false), 1600)
    } catch (err) {
      setExportStatus(err instanceof Error ? err.message : 'Не удалось подготовить Figma manifest.')
      setExportTone('error')
      setIsExporting(false)
    }
  }

  async function handleCancelGeneration() {
    if (!job?.id || cancelRequested) return
    setCancelRequested(true)
    try {
      await cancelResultsGenerationJob(job.id)
      setJob({ ...job, message: 'Прерывание генерации...' })
    } catch {
      setCancelRequested(false)
    }
  }

  if (isLoading) {
    return (
      <section className="results-page">
        <div className="results-page__head">
          <div>
            {isDemoMode ? <span className="project-card__badge">один запуск без регистрации</span> : null}
            <h1>Результаты генерации бренд-комплекта</h1>
            <p>Загружаем результаты...</p>
          </div>
        </div>
      </section>
    )
  }

  if (error || !results) {
    return (
      <section className="results-page">
        <div className="results-page__head">
          <div>
            {isDemoMode ? <span className="project-card__badge">один запуск без регистрации</span> : null}
            <h1>Результаты генерации бренд-комплекта</h1>
            <p>{error || 'Результаты пока недоступны.'}</p>
          </div>
        </div>
      </section>
    )
  }

  const hasResultsContent =
    results.palette_items.length > 0 ||
    results.assets.logos.length > 0 ||
    results.assets.icons.length > 0 ||
    results.assets.patterns.length > 0 ||
    results.assets.illustrations.length > 0

  return (
    <>
      <section className="results-page" data-results-page data-project-slug={projectSlug} data-brand-id={results.project.brand_id} data-active-job-id={job?.id || ''}>
        <div className="results-page__head">
          <div>
            {isDemoMode ? <span className="project-card__badge">один запуск без регистрации</span> : null}
            <h1>Результаты генерации бренд-комплекта</h1>
            <p>
              {results.selected_generation_job_id
                ? 'Открыта сохранённая версия генерации из истории'
                : hasResultsContent
                  ? 'Ваш бренд-комплект готов к использованию.'
                  : 'Здесь появятся результаты после первой успешной генерации в редакторе проекта.'}
            </p>
          </div>
        </div>

        <div className="results-stack">
          <section className="results-card">
            <div className="results-card__head">
              <div className="results-card__title">
                <h2>Цветовая палитра</h2>
              </div>
            </div>
            {results.palette_items.length ? (
              <div className="palette-results-grid">
                {results.palette_items.map((item) => (
                  <div className="palette-results-item" key={item.key}>
                    <div className="palette-results-item__swatch" style={{ background: item.value }}></div>
                    <div className="palette-results-item__label">{item.label}</div>
                    <div className="palette-results-item__value">{item.value}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="results-empty">Палитра пока недоступна.</div>
            )}
          </section>

          <ResultsAssetSection title="Логотипы" kind="logos" projectSlug={projectSlug} selectedJobId={results.selected_generation_job_id || ''} assets={results.assets.logos} gridClassName="results-icons-grid" cardClassName="results-icon-card" showDownloadButton={hasResultsContent && !isDemoMode} />
          <ResultsAssetSection title="Иконки" kind="icons" projectSlug={projectSlug} selectedJobId={results.selected_generation_job_id || ''} assets={results.assets.icons} gridClassName="results-icons-grid" cardClassName="results-icon-card" showDownloadButton={hasResultsContent && !isDemoMode} />
          <ResultsAssetSection title="Паттерны" kind="patterns" projectSlug={projectSlug} selectedJobId={results.selected_generation_job_id || ''} assets={results.assets.patterns} gridClassName="results-media-grid results-media-grid--patterns" cardClassName="results-media-card" showDownloadButton={hasResultsContent && !isDemoMode} />
          <ResultsAssetSection title="Иллюстрации" kind="illustrations" projectSlug={projectSlug} selectedJobId={results.selected_generation_job_id || ''} assets={results.assets.illustrations} gridClassName="results-media-grid" cardClassName="results-media-card" showDownloadButton={hasResultsContent && !isDemoMode} />

          {hasResultsContent ? <BrandMockupsPreview results={results} /> : null}

          {isDemoMode && hasResultsContent ? (
            <section className="results-card demo-register-card">
              <h2>Понравился результат?</h2>
              <p>Зарегистрируйтесь, чтобы сохранить проект, скачать полный бренд-комплект и экспортировать ассеты в Figma.</p>
              <div className="demo-register-card__actions">
                <Link to="/register" className="btn btn-primary">зарегистрироваться и продолжить</Link>
              </div>
            </section>
          ) : null}

          {hasResultsContent && !isDemoMode ? (
            <section className="results-card results-card--export" data-figma-export>
              <div className="results-card__head results-card__head--stacked">
                <div className="results-card__title">
                  <h2>Экспорт в Figma</h2>
                </div>
              </div>
              <ResultsFigmaImportGuide brandId={results.project.brand_id} />
              {manifestUrl ? (
                <details className="results-manifest" id="results-manifest-panel">
                  <summary className="results-manifest__summary">
                    <span>Скачать JSON manifest</span>
                  </summary>
                  <div className="results-manifest__content">
                    <a href={resolveAppPublicUrl(manifestUrl)} className="btn results-manifest__download-link" download>
                      Скачать файл manifest
                    </a>
                  </div>
                </details>
              ) : null}
              <div className="results-export__actions">
                <button type="button" className="btn btn-primary" disabled={isExporting} onClick={handleGenerateFigma}>
                  {isExporting ? 'Генерируем Figma JSON…' : manifestUrl ? 'Manifest готов ✓' : 'экспорт бренд-комплекта'}
                </button>
                <a href={`/projects/${projectSlug}/downloads/all${results.selected_generation_job_id ? `?job=${encodeURIComponent(results.selected_generation_job_id)}` : ''}`} className="btn btn-secondary">скачать архив</a>
              </div>
              <p className={`results-export__status${exportTone ? ` results-export__status--${exportTone}` : ''}`} aria-live="polite">{exportStatus}</p>
            </section>
          ) : null}
        </div>
      </section>

      {job ? <ResultsGenerationModal job={job} cancelRequested={cancelRequested} onCancel={handleCancelGeneration} onClose={() => setJob(null)} /> : null}
    </>
  )
}

function ResultsAssetSection({
  title,
  kind,
  projectSlug,
  selectedJobId,
  assets,
  gridClassName,
  cardClassName,
  showDownloadButton,
}: {
  title: string
  kind: 'logos' | 'icons' | 'patterns' | 'illustrations'
  projectSlug: string
  selectedJobId: string
  assets: ResultAsset[]
  gridClassName: string
  cardClassName: string
  showDownloadButton: boolean
}) {
  const downloadUrl = `/projects/${projectSlug}/downloads/${kind}${selectedJobId ? `?job=${encodeURIComponent(selectedJobId)}` : ''}`
  return (
    <section className="results-card" key={`${kind}-${selectedJobId || 'current'}`}>
      <div className="results-card__head">
        <div className="results-card__title">
          <h2>{title}</h2>
        </div>
        {showDownloadButton ? <a href={downloadUrl} className="btn btn-primary btn-inline">Скачать</a> : null}
      </div>
      {assets.length ? (
        <div className={gridClassName}>
          {assets.map((asset) => (
            <a href={asset.url} target="_blank" rel="noopener" className={cardClassName} title={`${asset.provider} / ${asset.name}`} key={`${selectedJobId || 'current'}-${asset.provider}-${asset.filename}-${asset.url}`}>
              <img src={asset.url} alt={asset.name} />
            </a>
          ))}
        </div>
      ) : (
        <div className="results-empty">{title} пока не найдены.</div>
      )}
    </section>
  )
}

function GenerationLogView({ logs }: { logs: string[] | undefined }) {
  const lines = Array.isArray(logs) ? logs : []
  return (
    <pre className="generation-log">
      {lines.map((line, i) => (
        <span
          key={i}
          className={isGenerationLogErrorLine(line) ? 'generation-log__line generation-log__line--error' : 'generation-log__line'}
        >
          {line}
          {i < lines.length - 1 ? '\n' : ''}
        </span>
      ))}
    </pre>
  )
}

function dashboardOverlayPortal(content: ReactNode) {
  if (typeof document === 'undefined') return null
  return createPortal(content, document.body)
}

function AppConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Ок',
  cancelLabel = 'Отмена',
  isBusy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title?: string
  message: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  isBusy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  useEffect(() => {
    if (!open) return
    document.body.classList.add('modal-open')
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isBusy) onCancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.classList.remove('modal-open')
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, isBusy, onCancel])

  if (!open) return null

  return dashboardOverlayPortal(
    <div className="app-confirm-modal" role="presentation">
      <button type="button" className="app-confirm-modal__backdrop" aria-label="Закрыть" disabled={isBusy} onClick={onCancel} />
      <div
        className={`app-confirm-modal__dialog${title ? '' : ' app-confirm-modal__dialog--message-only'}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={title ? 'app-confirm-modal-title' : 'app-confirm-modal-message'}
        aria-describedby={title ? 'app-confirm-modal-message' : undefined}
      >
        <button type="button" className="app-confirm-modal__close" aria-label="Закрыть" disabled={isBusy} onClick={onCancel}>
          ×
        </button>
        {title ? (
          <h2 className="app-confirm-modal__title" id="app-confirm-modal-title">
            {title}
          </h2>
        ) : null}
        <p className="app-confirm-modal__message" id="app-confirm-modal-message">
          {message}
        </p>
        <div className="app-confirm-modal__actions">
          <button type="button" className="btn btn-outline btn-inline app-confirm-modal__cancel" disabled={isBusy} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="btn btn-primary btn-inline" disabled={isBusy} onClick={onConfirm}>
            {isBusy ? 'Подождите...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
  )
}

function ResultsGenerationModal({
  job,
  cancelRequested,
  onCancel,
  onClose,
}: {
  job: GenerationJob
  cancelRequested: boolean
  onCancel: () => void
  onClose: () => void
}) {
  const terminal = ['completed', 'failed', 'cancelled', 'completed_with_errors'].includes(String(job.status || ''))
  const statuses = job.provider_statuses || job.providers || {}

  useEffect(() => {
    document.body.classList.add('modal-open')
    return () => document.body.classList.remove('modal-open')
  }, [])

  return dashboardOverlayPortal(
    <div className="generation-modal">
      <div className="generation-modal__backdrop"></div>
      <div className="generation-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="results-generation-modal-title">
        <button type="button" className="generation-modal__close" hidden={!terminal} onClick={onClose}>×</button>
        <h2 id="results-generation-modal-title">Генерация бренд-комплекта</h2>
        <div className="generation-progress">
          <div className="generation-progress__bar" style={{ width: `${Number(job.progress || 0)}%` }}></div>
        </div>
        <div className="generation-status-row">
          <strong>{Number(job.progress || 0)}%</strong>
          <span className="generation-status-text">{terminal && job.status === 'cancelled' ? 'Генерация прервана' : job.message || 'Выполняется'}</span>
        </div>
        <ProviderStatusRail statuses={statuses} />
        <label className="generation-log-label">Лог операций</label>
        <GenerationLogView logs={job.logs} />
        <div className="generation-modal__actions">
          {!terminal ? (
            <button type="button" className="btn btn-outline btn-inline" disabled={cancelRequested} onClick={onCancel}>
              {cancelRequested ? 'Прерываем...' : 'Прервать генерацию'}
            </button>
          ) : null}
        </div>
      </div>
    </div>,
  )
}

function ProviderStatusRail({ statuses }: { statuses: Record<string, string | undefined> }) {
  const providers = generationProviderEntries(statuses)
  const activeSlug = activeProviderSlug(statuses)
  const statusSignature = providers.map((provider) => `${provider.slug}:${normalizeProviderStatus(statuses[provider.slug])}`).join('|')
  const railRef = useRef<HTMLDivElement | null>(null)
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({})

  useLayoutEffect(() => {
    const rail = railRef.current
    const activeItem = itemRefs.current[activeSlug]
    if (!rail || !activeItem) return

    const frameId = window.requestAnimationFrame(() => {
      const targetLeft = activeItem.offsetLeft - (rail.clientWidth - activeItem.clientWidth) / 2
      const maxLeft = Math.max(0, rail.scrollWidth - rail.clientWidth)
      rail.scrollTo({
        left: Math.min(Math.max(0, targetLeft), maxLeft),
        behavior: 'smooth',
      })
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [activeSlug, statusSignature])

  return (
    <div className="generation-providers" ref={railRef} aria-label="Статусы AI-провайдеров">
      {providers.map((provider) => {
        const normalizedStatus = normalizeProviderStatus(statuses[provider.slug])
        return (
          <div
            className={`generation-provider${provider.slug === activeSlug ? ' generation-provider--active' : ''}`}
            key={provider.slug}
            ref={(node) => {
              itemRefs.current[provider.slug] = node
            }}
          >
            <span>{provider.label}</span>
            <span className={`provider-pill provider-pill--${normalizedStatus}`}>
              {providerStatusLabel(statuses[provider.slug])}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function ProjectEditorPage({
  projectSlug,
  isNewProjectFlow,
  isDemoMode = false,
}: {
  projectSlug: string
  isNewProjectFlow: boolean
  isDemoMode?: boolean
}) {
  const [editor, setEditor] = useState<ProjectEditorResponse | null>(null)
  const [tokens, setTokens] = useState<ProjectTokens>({})
  const [name, setName] = useState('')
  const [brandDescription, setBrandDescription] = useState('')
  const [brandId, setBrandId] = useState('')
  const [styleId, setStyleId] = useState('')
  const [paletteSlots, setPaletteSlots] = useState<Record<PaletteKey, string>>(DEFAULT_PALETTE)
  const [activePaletteKeys, setActivePaletteKeys] = useState<PaletteKey[]>(['primary', 'secondary', 'accent'])
  const [paletteSeedColor, setPaletteSeedColor] = useState(DEFAULT_PALETTE.primary)
  const [paletteSuggestions, setPaletteSuggestions] = useState<Record<PaletteVariantName, PaletteVariant> | null>(null)
  const [activePaletteVariant, setActivePaletteVariant] = useState<PaletteVariantName>('balanced')
  const [isPaletteLoading, setIsPaletteLoading] = useState(false)
  const [paletteAssistantOpen, setPaletteAssistantOpen] = useState(false)
  const [activeAssetType, setActiveAssetType] = useState<AssetType>('logos')
  const [promptFields, setPromptFields] = useState<Record<AssetType, string>>({
    logos: '',
    icons: '',
    patterns: '',
    illustrations: '',
  })
  const [assetCounts, setAssetCounts] = useState<Record<AssetType, number>>(DEFAULT_ASSET_COUNTS)
  const [iconStrokeWidth, setIconStrokeWidth] = useState(2)
  const [iconCorner, setIconCorner] = useState('rounded')
  const [iconFill, setIconFill] = useState('outline')
  const [illustrationFormat, setIllustrationFormat] = useState<'vector' | 'raster'>('vector')
  const [assetRefs, setAssetRefs] = useState<Record<AssetType, StyleRef[]>>(() => ({
    logos: [],
    icons: [],
    patterns: [],
    illustrations: [],
  }))
  const [refsLoadingType, setRefsLoadingType] = useState<AssetType | null>(null)
  const [buildStyle, setBuildStyle] = useState(true)
  const [selectedGenerationProviders, setSelectedGenerationProviders] = useState<string[]>(() => [...GENERATION_PROVIDERS.map((p) => p.slug)])
  const [generationJob, setGenerationJob] = useState<GenerationJob | null>(null)
  const [isGenerationModalOpen, setIsGenerationModalOpen] = useState(false)
  const [generationError, setGenerationError] = useState('')
  const [generationErrorHint, setGenerationErrorHint] = useState('')
  const [isGenerationStarting, setIsGenerationStarting] = useState(false)
  const [cancelRequested, setCancelRequested] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const demoResultsBase = isDemoMode ? `/demo/projects/${projectSlug}/results` : `/projects/${projectSlug}/results`
  const demoPaletteKeySet = new Set<string>(DEMO_PALETTE_KEYS)
  const demoTotalRefs = ASSET_TYPES.reduce((total, assetType) => total + assetRefs[assetType].length, 0)
  const demoRefLimitReached = isDemoMode && demoTotalRefs >= DEMO_MAX_REFERENCES

  useEffect(() => {
    const key = `kybby_import_warnings:${projectSlug}`
    const stored = sessionStorage.getItem(key)
    if (!stored) return
    sessionStorage.removeItem(key)
    setStatus(`Проект импортирован с предупреждениями: ${stored}`)
  }, [projectSlug])

  useEffect(() => {
    let alive = true
    setIsLoading(true)
    setError('')

    getProjectEditor(projectSlug, isNewProjectFlow)
      .then((payload) => {
        if (!alive) return
        setEditor(payload)
        hydrateEditorState(payload.tokens)
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : 'Не удалось загрузить проект.')
      })
      .finally(() => {
        if (alive) setIsLoading(false)
      })

    function hydrateEditorState(nextTokens: ProjectTokens) {
      setTokens(nextTokens)
      setName(getTokenString(nextTokens, 'name'))
      setBrandDescription(getTokenString(nextTokens, 'brand_description'))
      setBrandId(getTokenString(nextTokens, 'brand_id'))
      setStyleId(getTokenString(nextTokens, 'style_id'))
      const nextPaletteSlots = getPaletteSlots(nextTokens)
      setPaletteSlots(nextPaletteSlots)
      setActivePaletteKeys(getActivePaletteKeys(nextTokens))
      setPaletteSeedColor(normalizeHexColor(nextPaletteSlots.primary) || DEFAULT_PALETTE.primary)
      setPaletteSuggestions(null)
      setPaletteAssistantOpen(false)
      setActivePaletteVariant('balanced')
      setPromptFields(tokensToPromptFields(nextTokens))
      setAssetCounts(getAssetCounts(nextTokens))
      setIconStrokeWidth(getNestedTokenNumber(nextTokens, 'icon', 'strokeWidth', 2))
      setIconCorner(getNestedTokenString(nextTokens, 'icon', 'corner', 'rounded'))
      setIconFill(getNestedTokenString(nextTokens, 'icon', 'fill', 'outline'))
      setIllustrationFormat(illustrationFormatFromTokens(nextTokens))
      setAssetRefs(referencesToAssetRefs(nextTokens, projectSlug))
      setBuildStyle(getNestedTokenBoolean(nextTokens, 'generation', 'build_style', true))
      setSelectedGenerationProviders(getGenerationProviderSlugsFromTokens(nextTokens))
      if (isDemoMode) {
        setAssetCounts({
          logos: DEMO_ASSET_COUNTS.logos,
          icons: DEMO_ASSET_COUNTS.icons,
          patterns: DEMO_ASSET_COUNTS.patterns,
          illustrations: DEMO_ASSET_COUNTS.illustrations,
        })
        setActivePaletteKeys(['primary', 'secondary', 'accent'])
        setSelectedGenerationProviders(['recraft'])
        setBuildStyle(true)
      }
    }

    return () => {
      alive = false
    }
  }, [projectSlug, isNewProjectFlow, isDemoMode])

  function setPaletteValue(key: PaletteKey, value: string) {
    const nextColor = value.toUpperCase()
    setPaletteSlots((current) => ({ ...current, [key]: nextColor }))
    const normalized = normalizeHexColor(nextColor)
    if (normalized && key === 'primary') {
      setPaletteSeedColor(normalized)
      setPaletteSuggestions(null)
    }
  }

  function primarySeedColor() {
    return normalizeHexColor(paletteSlots.primary) || normalizeHexColor(paletteSeedColor) || DEFAULT_PALETTE.primary
  }

  async function fetchPaletteSuggestions() {
    const seedRole: PaletteKey = 'primary'
    const normalized = primarySeedColor()
    if (!normalized) return
    setIsPaletteLoading(true)
    try {
      const payload = await suggestProjectPalette(projectSlug, normalized, seedRole)
      setPaletteSuggestions(payload.variants)
      setPaletteSeedColor(payload.seed_color)
      setActivePaletteVariant(payload.variants.balanced ? 'balanced' : 'soft')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось подобрать палитру.')
    } finally {
      setIsPaletteLoading(false)
    }
  }

  async function applySuggestedPalette(variantName: PaletteVariantName) {
    let suggestions = paletteSuggestions
    if (!suggestions) {
      const normalized = primarySeedColor()
      if (!normalized) return
      const payload = await suggestProjectPalette(projectSlug, normalized, 'primary')
      suggestions = payload.variants
      setPaletteSuggestions(payload.variants)
      setPaletteSeedColor(payload.seed_color)
    }

    const variant = suggestions[variantName]
    if (!variant) return
    setActivePaletteVariant(variantName)
    setPaletteSlots(PALETTE_KEYS.reduce<Record<PaletteKey, string>>((acc, key) => {
      acc[key] = normalizeHexColor(variant[key]) || DEFAULT_PALETTE[key]
      return acc
    }, { ...DEFAULT_PALETTE }))
    setActivePaletteKeys((current) => {
      const seedKey: PaletteKey = 'primary'
      return current.includes(seedKey) ? current : [...current, seedKey].slice(0, 6)
    })
  }

  function togglePaletteKey(key: PaletteKey, checked: boolean) {
    if (isDemoMode && !demoPaletteKeySet.has(key)) return
    setActivePaletteKeys((current) => {
      if (checked) return current.includes(key) ? current : [...current, key].slice(0, 6)
      if (current.length <= 2) return current
      return current.filter((item) => item !== key)
    })
  }

  function setAssetCount(type: AssetType, value: string) {
    if (isDemoMode) return
    setAssetCounts((current) => ({ ...current, [type]: clampAssetCount(value, DEFAULT_ASSET_COUNTS[type]) }))
  }

  function syncAssetRefs(nextRefs: Record<AssetType, StyleRef[]>) {
    const styleImages = ASSET_TYPES.flatMap((type) => nextRefs[type].map((ref) => ref.path))
    setAssetRefs(nextRefs)
    setTokens((current) => ({
      ...current,
      references: {
        ...getTokenRecord(current, 'references'),
        ...ASSET_TYPES.reduce<Record<AssetType, string[]>>((acc, type) => {
          acc[type] = nextRefs[type].map((ref) => ref.path)
          return acc
        }, {} as Record<AssetType, string[]>),
        style_images: styleImages,
      },
    }))
  }

  function applyReferencesResponse(payload: { references?: Record<AssetType, string[]> }) {
    if (!payload.references) return
    syncAssetRefs(
      ASSET_TYPES.reduce<Record<AssetType, StyleRef[]>>((acc, type) => {
        acc[type] = normalizeStyleRefs(payload.references?.[type], projectSlug)
        return acc
      }, {
        logos: [],
        icons: [],
        patterns: [],
        illustrations: [],
      }),
    )
  }

  async function handleUploadRefs(assetType: AssetType, files: FileList | null) {
    if (!files?.length) return
    setRefsLoadingType(assetType)
    setStatus('')
    setError('')

    try {
      const payload = await uploadProjectEditorRefs(projectSlug, files, assetType)
      applyReferencesResponse(payload)
      setStatus('Референсы загружены.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить референсы.')
    } finally {
      setRefsLoadingType(null)
    }
  }

  async function handleDeleteRef(assetType: AssetType, path: string) {
    setRefsLoadingType(assetType)
    setStatus('')
    setError('')

    try {
      const payload = await deleteProjectEditorRef(projectSlug, path, assetType)
      applyReferencesResponse(payload)
      setStatus('Референс удалён.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить референс.')
    } finally {
      setRefsLoadingType(null)
    }
  }

  function buildEditorPayload(): ProjectTokens {
    const next = structuredClone(tokens) as ProjectTokens
    next.name = name.trim()
    next.brand_description = brandDescription.trim().slice(0, 500)
    next.brand_id = brandId.trim()
    next.style_id = styleId.trim()

    const palette = activePaletteKeys.reduce<Record<string, string>>((acc, key) => {
      acc[key] = normalizeHexColor(paletteSlots[key]) || DEFAULT_PALETTE[key]
      return acc
    }, {})

    next.palette_slots = PALETTE_KEYS.reduce<Record<string, string>>((acc, key) => {
      acc[key] = normalizeHexColor(paletteSlots[key]) || DEFAULT_PALETTE[key]
      return acc
    }, {})
    next.palette = palette
    next.generation = {
      ...getTokenRecord(next, 'generation'),
      active_palette_keys: activePaletteKeys,
      logos_count: assetCounts.logos,
      icons_count: assetCounts.icons,
      patterns_count: assetCounts.patterns,
      illustrations_count: assetCounts.illustrations,
      build_style: buildStyle,
      provider_slugs: [...selectedGenerationProviders],
    }
    next.icon = {
      ...getTokenRecord(next, 'icon'),
      strokeWidth: iconStrokeWidth,
      corner: iconCorner,
      fill: iconFill,
    }
    next.illustration = {
      ...getTokenRecord(next, 'illustration'),
      vector: illustrationFormat === 'vector',
      raster: illustrationFormat === 'raster',
    }
    next.prompts = {
      ...getTokenRecord(next, 'prompts'),
      logos: expandPromptFieldForCount(promptFields.logos, assetCounts.logos),
      icons: expandPromptFieldForCount(promptFields.icons, assetCounts.icons),
      patterns: expandPromptFieldForCount(promptFields.patterns, assetCounts.patterns),
      illustrations: expandPromptFieldForCount(promptFields.illustrations, assetCounts.illustrations),
    }
    next.references = {
      ...getTokenRecord(next, 'references'),
      ...ASSET_TYPES.reduce<Record<AssetType, string[]>>((acc, type) => {
        acc[type] = assetRefs[type].map((ref) => ref.path)
        return acc
      }, {} as Record<AssetType, string[]>),
    }

    return next
  }

  async function handleSave() {
    setIsSaving(true)
    setStatus('')
    setError('')

    try {
      const payload = await saveProjectEditor(projectSlug, buildEditorPayload())
      setTokens(payload.tokens)
      setStatus('Проект сохранён.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить проект.')
    } finally {
      setIsSaving(false)
    }
  }

  function toggleGenerationProvider(slug: string, checked: boolean) {
    if (slug === 'recraft' && !checked && buildStyle) {
      setBuildStyle(false)
    }
    setSelectedGenerationProviders((prev) => {
      if (checked) {
        return prev.includes(slug) ? prev : [...prev, slug]
      }
      if (prev.length <= 1) {
        return prev
      }
      return prev.filter((s) => s !== slug)
    })
  }

  async function handleGenerate() {
    setIsGenerationStarting(true)
    setIsGenerationModalOpen(true)
    setGenerationError('')
    setGenerationErrorHint('')
    setCancelRequested(false)
    const initialProviderStatuses = Object.fromEntries(
      GENERATION_PROVIDERS.map((p) => [p.slug, selectedGenerationProviders.includes(p.slug) ? 'pending' : 'skipped']),
    ) as Record<string, string>
    setGenerationJob({
      id: '',
      status: 'running',
      progress: 0,
      message: 'Автосохранение проекта',
      logs: ['Инициализация генерации...'],
      provider_statuses: initialProviderStatuses,
    })

    try {
      const editorPayload = buildEditorPayload()
      const saved = await saveProjectEditor(projectSlug, editorPayload)
      setTokens(saved.tokens)

      const started = await startProjectGeneration(projectSlug, {
        style_id: styleId.trim(),
        brand_id: brandId.trim(),
        logos_count: assetCounts.logos,
        icons_count: assetCounts.icons,
        patterns_count: assetCounts.patterns,
        illustrations_count: assetCounts.illustrations,
        build_style: buildStyle,
        provider_slugs: [...selectedGenerationProviders],
      })

      if (!started.job_id) {
        throw new Error('Сервер не вернул job_id')
      }

      await pollEditorGenerationJob(started.job_id)
    } catch (err) {
      setGenerationError(err instanceof Error ? err.message : 'Ошибка запуска генерации.')
      setGenerationJob((current) => ({
        id: current?.id || '',
        status: 'failed',
        progress: current?.progress || 0,
        message: 'Ошибка генерации',
        logs: [...(current?.logs || []), err instanceof Error ? err.message : 'Ошибка запуска генерации.'],
        provider_statuses: current?.provider_statuses || Object.fromEntries(
          GENERATION_PROVIDERS.map((p) => [p.slug, selectedGenerationProviders.includes(p.slug) ? 'pending' : 'skipped']),
        ) as Record<string, string>,
      }))
    } finally {
      setIsGenerationStarting(false)
    }
  }

  async function pollEditorGenerationJob(jobId: string) {
    for (let attempt = 0; attempt < 600; attempt += 1) {
      const payload = await getGenerationJob(jobId)
      const job = payload.job
      setGenerationJob(job)

      if (job.style_id) {
        setStyleId(job.style_id)
      }

      if (job.status === 'failed') {
        setGenerationError(job.error || job.message || 'Генерация не удалась.')
        setGenerationErrorHint(job.error_hint || '')
      }

      if (['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(job.status)) {
        return job
      }

      await new Promise((resolve) => setTimeout(resolve, 1000))
    }

    throw new Error('Не удалось получить актуальный статус генерации (таймаут опроса)')
  }

  async function handleCancelGeneration() {
    if (!generationJob?.id || cancelRequested) return
    setCancelRequested(true)
    try {
      await cancelResultsGenerationJob(generationJob.id)
      setGenerationJob({ ...generationJob, message: 'Прерывание генерации...' })
    } catch (err) {
      setCancelRequested(false)
      setGenerationError(err instanceof Error ? err.message : 'Не удалось прервать генерацию.')
    }
  }

  async function handleReset() {
    if (!window.confirm('Сбросить проект к значениям по умолчанию?')) return
    setIsSaving(true)
    setStatus('')
    setError('')

    try {
      const payload = await resetProjectEditor(projectSlug)
      setTokens(payload.tokens)
      setName(getTokenString(payload.tokens, 'name'))
      setBrandDescription(getTokenString(payload.tokens, 'brand_description'))
      setBrandId(getTokenString(payload.tokens, 'brand_id'))
      setStyleId(getTokenString(payload.tokens, 'style_id'))
      const nextPaletteSlots = getPaletteSlots(payload.tokens)
      setPaletteSlots(nextPaletteSlots)
      setActivePaletteKeys(getActivePaletteKeys(payload.tokens))
      setPaletteSeedColor(normalizeHexColor(nextPaletteSlots.primary) || DEFAULT_PALETTE.primary)
      setPaletteSuggestions(null)
      setPaletteAssistantOpen(false)
      setActivePaletteVariant('balanced')
      setPromptFields(tokensToPromptFields(payload.tokens))
      setAssetCounts(getAssetCounts(payload.tokens))
      setIconStrokeWidth(getNestedTokenNumber(payload.tokens, 'icon', 'strokeWidth', 2))
      setIconCorner(getNestedTokenString(payload.tokens, 'icon', 'corner', 'rounded'))
      setIconFill(getNestedTokenString(payload.tokens, 'icon', 'fill', 'outline'))
      setIllustrationFormat(illustrationFormatFromTokens(payload.tokens))
      setAssetRefs(referencesToAssetRefs(payload.tokens, projectSlug))
      setBuildStyle(getNestedTokenBoolean(payload.tokens, 'generation', 'build_style', true))
      setSelectedGenerationProviders(getGenerationProviderSlugsFromTokens(payload.tokens))
      setStatus('Проект сброшен.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сбросить проект.')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <section className="project-editor">
        <div className="project-page-head">
          <div>
            {isDemoMode ? <span className="project-card__badge">один запуск без регистрации</span> : null}
            <h1>Генерация бренд-комплекта</h1>
            <p>Загружаем проект...</p>
          </div>
        </div>
      </section>
    )
  }

  if (error && !editor) {
    return (
      <section className="project-editor">
        <div className="project-page-head">
          <div>
            {isDemoMode ? <span className="project-card__badge">один запуск без регистрации</span> : null}
            <h1>Генерация бренд-комплекта</h1>
            <p>{error}</p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="project-editor">
      <div className="project-page-head">
        <div>
          {isDemoMode ? <span className="project-card__badge">один запуск без регистрации</span> : null}
          <h1>Генерация бренд-комплекта</h1>
          <p>Настрой стиль бренда и сгенерируй логотипы, иконки, паттерны и иллюстрации</p>
        </div>
      </div>

      <form className="editor-sections" onSubmit={(event) => event.preventDefault()}>
        <section className="editor-card editor-card--progressive" data-progress-step="1">
          <div className="editor-card__head">
            <span className="step-badge">1</span>
            <div>
              <div className="step-progress-caption">Шаг 1 из 5</div>
              <h2>Бренд</h2>
              <p>Основные параметры вашего бренда</p>
            </div>
          </div>
          <div className="editor-grid editor-grid--single">
            <label className="editor-field">
              <span>Название бренда</span>
              <input type="text" value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <label className="editor-field">
              <span>О бренде</span>
              <textarea
                value={brandDescription}
                rows={4}
                maxLength={500}
                placeholder="Кратко опишите бренд: чем занимаетесь, для кого, какое настроение и стиль. Это попадёт в превью на странице результатов."
                onChange={(event) => setBrandDescription(event.target.value)}
              />
            </label>
          </div>
          <div className="editor-grid">
            <label className="editor-field">
              <span>Style ID</span>
              <input type="text" value={styleId} placeholder={styleId ? '' : 'Будет заполнен после генерации стиля'} disabled={!styleId} onChange={(event) => setStyleId(event.target.value)} />
            </label>
            <label className="editor-field">
              <span>Brand ID</span>
              <input type="text" value={brandId} onChange={(event) => setBrandId(event.target.value)} />
            </label>
          </div>
          <div className="editor-note">Brand ID будет использоваться как идентификатор набора ассетов в структуре папок и путях для интеграции с Figma-плагином.</div>
        </section>

        <section className="editor-card editor-card--progressive" data-progress-step="2">
          <div className="editor-card__head">
            <span className="step-badge">2</span>
            <div>
              <div className="step-progress-caption">Шаг 2 из 5</div>
              <h2>Визуальный стиль</h2>
              <p>Цветовая палитра: в генерацию попадают отмеченные цвета из сетки ниже</p>
            </div>
          </div>

          {!isDemoMode ? (
            <p className="editor-note editor-note--compact">
              Итоговая палитра — это ваши значения в сетке (шаг сохранения / запуска). Блок «Подбор палитры» ниже необязателен: он лишь предлагает варианты; они применятся к сетке только после нажатия Soft, Balanced или Contrast.
            </p>
          ) : null}
          {isDemoMode ? (
            <p className="editor-note editor-note--compact demo-inline-note">
              В демо-режиме доступна базовая палитра из 3 цветов. Зарегистрируйтесь, чтобы настраивать расширенную палитру.
            </p>
          ) : null}

          <div className="palette-grid palette-grid--six">
            {PALETTE_KEYS.map((key) => {
              const slotActive = activePaletteKeys.includes(key)
              const demoLocked = isDemoMode && !demoPaletteKeySet.has(key)
              return (
                <div
                  className={`palette-item${slotActive ? '' : ' palette-item--inactive'}${demoLocked ? ' palette-item--demo-locked' : ''}`}
                  key={key}
                >
                  <label className="palette-item__label">
                    <input type="checkbox" checked={slotActive} disabled={demoLocked} onChange={(event) => togglePaletteKey(key, event.target.checked)} /> <span>{PALETTE_LABELS[key]}</span>
                  </label>
                  <input
                    type="color"
                    className="palette-swatch"
                    value={normalizeHexColor(paletteSlots[key]) || DEFAULT_PALETTE[key]}
                    disabled={!slotActive || demoLocked}
                    onChange={(event) => setPaletteValue(key, event.target.value)}
                  />
                  <input
                    type="text"
                    className="editor-field__compact"
                    value={paletteSlots[key]}
                    disabled={!slotActive || demoLocked}
                    onChange={(event) => setPaletteValue(key, event.target.value)}
                  />
                </div>
              )
            })}
          </div>
          <div className="editor-note editor-note--compact" hidden={activePaletteKeys.length >= 2}>Выберите минимум 2 цвета палитры. Они будут использоваться в текущей генерации.</div>

          {!isDemoMode ? (
            <>
              <div className="palette-assistant-bar">
                <button
                  type="button"
                  className="btn btn-outline btn-inline palette-assistant-toggle"
                  aria-expanded={paletteAssistantOpen}
                  onClick={() => {
                    const next = !paletteAssistantOpen
                    setPaletteAssistantOpen(next)
                    if (next && primarySeedColor()) {
                      void fetchPaletteSuggestions()
                    }
                  }}
                >
                  {paletteAssistantOpen ? 'Скрыть подбор палитры' : 'Подобрать палитру по опорному цвету (необязательно)'}
                </button>
              </div>

              {paletteAssistantOpen ? (
                <div className="palette-autofill">
                  <div className="palette-autofill__head">
                    <div>
                      <h3>Подбор палитры</h3>
                      <p>
                        Сейчас за опору взят цвет {PALETTE_LABELS.primary}.
                      </p>
                      <p>
                        Нажмите вариант Soft / Balanced / Contrast, чтобы подставить предложенные 6 цветов. Пока не нажали — в генерации используются только ваши значения в сетке.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn btn-inline palette-autofill__refresh"
                      disabled={isPaletteLoading || !primarySeedColor()}
                      onClick={() => void fetchPaletteSuggestions()}
                    >
                      {isPaletteLoading ? 'Обновляем...' : 'Обновить варианты'}
                    </button>
                  </div>
                  <div className="palette-autofill__actions">
                    {(['soft', 'balanced', 'contrast'] as const).map((variantName) => (
                      <button
                        type="button"
                        className={`small-action palette-variant-btn${activePaletteVariant === variantName ? ' is-active' : ''}`}
                        key={variantName}
                        onClick={() => void applySuggestedPalette(variantName)}
                      >
                        {variantName === 'soft' ? 'Soft' : variantName === 'balanced' ? 'Balanced' : 'Contrast'}
                      </button>
                    ))}
                  </div>
                  <div className="palette-autofill__preview">
                    {paletteSuggestions?.[activePaletteVariant]
                      ? PALETTE_KEYS.map((key) => (
                        <div className="palette-preview-swatch" key={key}>
                          <div className="palette-preview-swatch__color" style={{ background: paletteSuggestions[activePaletteVariant][key] }}></div>
                          <div className="palette-preview-swatch__meta">
                            <span className="palette-preview-swatch__label">{PALETTE_LABELS[key]}</span>
                            <strong className="palette-preview-swatch__value">{paletteSuggestions[activePaletteVariant][key]}</strong>
                          </div>
                        </div>
                      ))
                      : null}
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </section>

        <section className="editor-card editor-card--progressive" data-progress-step="3">
          <div className="editor-card__head">
            <span className="step-badge">3</span>
            <div>
              <div className="step-progress-caption">Шаг 3 из 5</div>
              <h2>Генерируемые ассеты</h2>
              <p>Промпты, референсы и параметры для логотипов, иконок, паттернов и иллюстраций</p>
            </div>
          </div>
          <div className="asset-tabs" role="tablist" aria-label="Тип ассетов">
            {ASSET_TYPES.map((type) => {
              const isIllustrationsLocked = isDemoMode && type === 'illustrations'
              return (
                <button
                  type="button"
                  className={`asset-tab${activeAssetType === type && !isIllustrationsLocked ? ' asset-tab--active' : ''}${isIllustrationsLocked ? ' asset-tab--locked' : ''}`}
                  role="tab"
                  aria-selected={activeAssetType === type && !isIllustrationsLocked ? 'true' : 'false'}
                  aria-controls={isIllustrationsLocked ? undefined : `asset-panel-${type}`}
                  aria-disabled={isIllustrationsLocked ? 'true' : undefined}
                  id={`asset-tab-${type}`}
                  key={type}
                  disabled={isIllustrationsLocked}
                  onClick={() => setActiveAssetType(type)}
                >
                  {ASSET_LABELS[type]}
                  {isIllustrationsLocked ? <DemoTabLockIcon /> : null}
                </button>
              )
            })}
          </div>

          {isDemoMode ? (
            <p className="editor-note editor-note--compact demo-inline-note">
              В демо: 1 логотип, 2 иконки, 1 паттерн. Иллюстрации и повторная генерация доступны после регистрации. Можно загрузить 1 референс до 2 МБ.
            </p>
          ) : null}

          {(isDemoMode ? ASSET_TYPES.filter((type) => type !== 'illustrations') : ASSET_TYPES).map((type) => (
            <div
              id={`asset-panel-${type}`}
              className={`asset-panel${activeAssetType === type ? ' asset-panel--active' : ''}`}
              role="tabpanel"
              aria-labelledby={`asset-tab-${type}`}
              hidden={activeAssetType !== type}
              key={type}
            >
              <>
                <label className="editor-field">
                  <span>Промпт</span>
                  <textarea
                    rows={4}
                    placeholder={ASSET_PLACEHOLDERS[type]}
                    autoComplete="off"
                    value={promptFields[type]}
                    onChange={(event) => setPromptFields((current) => ({ ...current, [type]: event.target.value }))}
                  />
                </label>

                {type === 'icons' ? (
                  <div className="editor-grid">
                    <label className="editor-field">
                      <span>Stroke Width (px)</span>
                      <input type="number" min="0" step="0.5" value={iconStrokeWidth} onChange={(event) => setIconStrokeWidth(Number(event.target.value || 0))} />
                    </label>
                    <label className="editor-field">
                      <span>Corner</span>
                      <select value={iconCorner} onChange={(event) => setIconCorner(event.target.value)}>
                        <option value="rounded">Rounded</option>
                        <option value="square">Square</option>
                        <option value="butt">Butt</option>
                      </select>
                    </label>
                    <label className="editor-field">
                      <span>Fill</span>
                      <select value={iconFill} onChange={(event) => setIconFill(event.target.value)}>
                        <option value="outline">Outline</option>
                        <option value="filled">Filled</option>
                        <option value="duotone">Duotone</option>
                      </select>
                    </label>
                  </div>
                ) : null}

                {type === 'illustrations' ? (
                  <div className="illustration-format-row" role="radiogroup" aria-label="Формат иллюстрации">
                    <label className="illustration-format-check">
                      <input
                        type="radio"
                        name={`illustration-format-${projectSlug}`}
                        value="vector"
                        checked={illustrationFormat === 'vector'}
                        onChange={() => setIllustrationFormat('vector')}
                      />
                      <span>Вектор</span>
                    </label>
                    <label className="illustration-format-check">
                      <input
                        type="radio"
                        name={`illustration-format-${projectSlug}`}
                        value="raster"
                        checked={illustrationFormat === 'raster'}
                        onChange={() => setIllustrationFormat('raster')}
                      />
                      <span>Растр</span>
                    </label>
                  </div>
                ) : null}

                <div className="editor-grid editor-grid--narrow asset-panel-counts">
                  <label className="editor-field">
                    <span>{assetCountLabel(type)}</span>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={isDemoMode ? DEMO_ASSET_COUNTS[type] : assetCounts[type]}
                      disabled={isDemoMode}
                      onChange={(event) => setAssetCount(type, event.target.value)}
                    />
                  </label>
                </div>

                <div className="asset-panel-refs">
                  <span className="asset-panel-refs__title">{ASSET_REF_LABELS[type]}</span>
                  <p className="asset-panel-refs__hint">
                    {isDemoMode
                      ? 'В демо можно загрузить 1 референс на весь проект (до 2 МБ).'
                      : 'Изображения, которые задают желаемую эстетику для этого типа ассетов.'}
                  </p>
                  <label
                    className={`btn btn-primary btn-upload btn-upload--compact asset-panel-refs__upload${demoRefLimitReached ? ' asset-panel-refs__upload--disabled' : ''}`}
                  >
                    <input
                      type="file"
                      multiple={!isDemoMode}
                      accept=".png,.jpg,.jpeg,.webp,.gif,.bmp"
                      hidden
                      disabled={refsLoadingType === type || demoRefLimitReached}
                      onChange={(event) => {
                        void handleUploadRefs(type, event.target.files)
                        event.currentTarget.value = ''
                      }}
                    />
                    <span>{refsLoadingType === type ? 'Загружаем...' : 'Загрузить'}</span>
                  </label>
                  <div className="refs-grid refs-grid--compact">
                    {refsLoadingType === type && !assetRefs[type].length ? <div className="refs-empty">Загрузка...</div> : null}
                    {refsLoadingType !== type && !assetRefs[type].length && !demoRefLimitReached ? <div className="refs-empty">Референсы пока не загружены</div> : null}
                    {assetRefs[type].map((ref) => (
                      <div className="ref-card" key={`${type}-${ref.path}`}>
                        <a href={ref.url} target="_blank" rel="noopener" className="ref-card__preview">
                          <img src={ref.url} alt={ref.name} className="ref-card__image" />
                        </a>
                        <button
                          type="button"
                          className="ref-delete"
                          disabled={refsLoadingType === type}
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            void handleDeleteRef(type, ref.path)
                          }}
                        >
                          Удалить
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            </div>
          ))}
        </section>

        <section className="editor-card editor-card--progressive" data-progress-step="4">
          <div className="editor-card__head">
            <span className="step-badge">4</span>
            <div>
              <div className="step-progress-caption">Шаг 4 из 5</div>
              <h2>Параметры генерации</h2>
              <p>Финальные настройки перед запуском генерации бренд-комплекта</p>
            </div>
          </div>
          <label className="build-style-box">
            <input
              type="checkbox"
              checked={buildStyle}
              disabled={isDemoMode}
              onChange={(event) => {
                const next = event.target.checked
                setBuildStyle(next)
                if (next) {
                  setSelectedGenerationProviders((prev) => (prev.includes('recraft') ? prev : [...prev, 'recraft']))
                }
              }}
            />
            <div>
              <strong>Создать новый стиль по загруженным референсам</strong>
              <span>Если включено, Recraft проанализирует все референсы с вкладок ассетов и создаст новый Style ID.</span>
            </div>
          </label>

          {isDemoMode ? (
            <div className="demo-provider-box">
              <p className="demo-provider-box__provider">
                <strong>Провайдер: {DEMO_PROVIDER_LABEL}</strong>
              </p>
              <p>После регистрации вы сможете выбрать Recraft, Flux, Seedream и другие модели, а также подключить свои API-ключи.</p>
            </div>
          ) : (
            <div className="editor-field generation-providers-pick">
              <span>Нейросети для этого запуска</span>
              <p className="generation-providers-hint">
                Отметьте модели, которые должны выдать ассеты. Style&nbsp;ID нужен только для Recraft; остальные провайдеры работают по описанию бренда и палитре.
              </p>
              <div className="generation-providers-checkboxes" role="group" aria-label="Провайдеры генерации">
                {GENERATION_PROVIDERS.map((p) => (
                  <label key={p.slug} className="generation-provider-check">
                    <input
                      type="checkbox"
                      checked={selectedGenerationProviders.includes(p.slug)}
                      onChange={(event) => toggleGenerationProvider(p.slug, event.target.checked)}
                    />
                    <span>{p.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="generated-summary">
            <h3>Что будет сгенерировано:</h3>
            <ul>
              {isDemoMode ? (
                <>
                  <li>1 логотип, 2 иконки, 1 паттерн</li>
                  <li>Бренд-превью на мокапах</li>
                  <li>Одна демо-генерация без регистрации</li>
                </>
              ) : (
                <>
                  <li>Иконки в заданном стиле и цветовой палитре</li>
                  <li>Варианты логотипов в едином стиле бренда</li>
                  <li>Seamless паттерны с заданными мотивами</li>
                  <li>Иллюстрации в едином визуальном стиле</li>
                  <li>JSON-токены для интеграции с Figma</li>
                </>
              )}
            </ul>
          </div>
        </section>

        <section className="editor-card editor-card--cta editor-card--progressive" data-progress-step="5">
          <div className="step-progress-caption step-progress-caption--center">Шаг 5 из 5</div>
          <div className="cta-icon">✧</div>
          <h2>Готово к генерации?</h2>
          <p>Все параметры настроены. Нажмите кнопку ниже, чтобы запустить генерацию бренд-комплекта.</p>
          <button type="button" className="btn btn-primary editor-generate-btn" disabled={isGenerationStarting} onClick={() => void handleGenerate()}>
            {isGenerationStarting ? 'Запускаем генерацию...' : 'Собрать бренд-комплект'}
          </button>
          <div className="cta-stats">
            <span><strong>{isDemoMode ? DEMO_ASSET_COUNTS.logos : assetCounts.logos}</strong> вариантов логотипа</span>
            <span><strong>{isDemoMode ? DEMO_ASSET_COUNTS.icons : assetCounts.icons}</strong> иконок</span>
            <span><strong>{isDemoMode ? DEMO_ASSET_COUNTS.patterns : assetCounts.patterns}</strong> паттернов</span>
            <span><strong>{isDemoMode ? DEMO_ASSET_COUNTS.illustrations : assetCounts.illustrations}</strong> иллюстраций</span>
          </div>
          <div className="editor-status">
            {generationJob
              ? generationJob.status === 'completed'
                ? 'Бренд-комплект успешно сгенерирован ✅'
                : generationJob.status === 'completed_with_errors'
                  ? 'Генерация завершена с ошибками'
                  : generationJob.status === 'failed'
                    ? 'Ошибка генерации'
                    : generationJob.status === 'cancelled'
                      ? 'Генерация прервана'
                      : 'Идёт генерация...'
              : ''}
          </div>
        </section>

        <div className="editor-actions-row">
          <button type="button" className="btn btn-outline btn-inline" disabled={isSaving} onClick={handleSave}>
            {isSaving ? 'Сохраняем...' : 'Сохранить'}
          </button>
          {!isDemoMode ? (
            <>
              <a href={`/projects/${projectSlug}/download`} className="btn btn-outline btn-inline">Скачать конфигурацию проекта</a>
              <a href={`/projects/${projectSlug}/download-bundle`} className="btn btn-outline btn-inline">Скачать ZIP (с референсами)</a>
            </>
          ) : null}
          <button type="button" className="btn btn-inline btn-reset-light" disabled={isSaving} onClick={handleReset}>Сброс</button>
        </div>
        {status ? <div className="editor-status">{status}</div> : null}
        {error ? <div className="editor-status">{error}</div> : null}
      </form>
      {isGenerationModalOpen && generationJob ? (
        <ProjectGenerationModal
          job={generationJob}
          projectSlug={projectSlug}
          resultsBasePath={demoResultsBase}
          cancelRequested={cancelRequested}
          errorMessage={generationError}
          errorHint={generationErrorHint}
          onCancel={handleCancelGeneration}
          onClose={() => setIsGenerationModalOpen(false)}
          onDismissError={() => {
            setGenerationError('')
            setGenerationErrorHint('')
          }}
        />
      ) : null}
    </section>
  )
}

function ProjectGenerationModal({
  job,
  projectSlug,
  resultsBasePath,
  cancelRequested,
  errorMessage,
  errorHint,
  onCancel,
  onClose,
  onDismissError,
}: {
  job: GenerationJob
  projectSlug: string
  resultsBasePath?: string
  cancelRequested: boolean
  errorMessage: string
  errorHint: string
  onCancel: () => void
  onClose: () => void
  onDismissError: () => void
}) {
  const resultsPath = resultsBasePath || `/projects/${projectSlug}/results`
  const terminal = ['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(String(job.status || ''))
  const canOpenResult = job.status === 'completed' || job.status === 'completed_with_errors'
  const statuses = job.provider_statuses || job.providers || {}

  useEffect(() => {
    document.body.classList.add('modal-open')
    return () => document.body.classList.remove('modal-open')
  }, [])

  return dashboardOverlayPortal(
    <>
      <div className="generation-modal">
        <div className="generation-modal__backdrop" onClick={onClose}></div>
        <div className="generation-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="generation-modal-title">
          <button type="button" className="generation-modal__close" onClick={onClose}>×</button>
          <h2 id="generation-modal-title">Генерация бренд-комплекта</h2>
          <div className="generation-progress">
            <div className="generation-progress__bar" style={{ width: `${Number(job.progress || 0)}%` }}></div>
          </div>
          <div className="generation-status-row">
            <strong>{Number(job.progress || 0)}%</strong>
            <span className="generation-status-text">
              {job.status === 'cancelled'
                ? 'Генерация прервана'
                : job.status === 'failed'
                  ? 'Ошибка генерации'
                  : job.status === 'completed'
                    ? 'Завершено'
                    : job.status === 'completed_with_errors'
                      ? 'Завершено с ошибками'
                      : job.message || job.status_text || 'Выполняется'}
            </span>
          </div>
          <ProviderStatusRail statuses={statuses} />
          <label className="generation-log-label">Лог операций</label>
          <GenerationLogView logs={job.logs} />
          <div className="generation-modal__actions">
            {!terminal ? (
              <button type="button" className="btn btn-outline btn-inline" disabled={cancelRequested} onClick={onCancel}>
                {cancelRequested ? 'Прерываем...' : 'Прервать генерацию'}
              </button>
            ) : null}
            {canOpenResult ? (
              <Link
                className="btn btn-primary btn-inline"
                to={`${resultsPath}${job.id ? `?job=${encodeURIComponent(job.id)}` : ''}`}
              >
                Посмотреть результат
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      {errorMessage ? (
        <div className="generation-error-modal">
          <div className="generation-error-modal__backdrop" onClick={onDismissError}></div>
          <div className="generation-error-modal__dialog" role="alertdialog" aria-modal="true" aria-labelledby="generation-error-title" aria-describedby="generation-error-body">
            <button type="button" className="generation-modal__close" onClick={onDismissError}>×</button>
            <h2 id="generation-error-title">Ошибка генерации</h2>
            <p id="generation-error-body" className="generation-error-modal__message">{errorMessage}</p>
            {errorHint ? <p className="generation-error-modal__hint">{errorHint}</p> : null}
            <div className="generation-error-modal__actions">
              <button type="button" className="btn btn-primary btn-inline" onClick={onDismissError}>Ок</button>
            </div>
          </div>
        </div>
      ) : null}
    </>,
  )
}

export function ProjectsDashboard() {
  const navigate = useNavigate()
  const importInputRef = useRef<HTMLInputElement>(null)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [error, setError] = useState('')
  const [projectPendingDelete, setProjectPendingDelete] = useState<ProjectSummary | null>(null)
  const [isDeletingProject, setIsDeletingProject] = useState(false)

  useEffect(() => {
    let alive = true

    listProjects()
      .then((payload) => {
        if (!alive) return
        setProjects(payload.projects)
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : 'Не удалось загрузить проекты.')
      })
      .finally(() => {
        if (alive) setIsLoading(false)
      })

    return () => {
      alive = false
    }
  }, [])

  async function handleCreateProject() {
    setError('')
    setIsCreating(true)

    try {
      const payload = await createProject()
      navigate(payload.redirect_url.replace(/^\/app/, ''))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать проект.')
      setIsCreating(false)
    }
  }

  function handleImportClick() {
    importInputRef.current?.click()
  }

  async function handleImportFileChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    input.value = ''
    if (!file) return

    setError('')
    setIsImporting(true)

    try {
      const payload = await importProjectBundle(file)
      if (payload.warnings?.length) {
        sessionStorage.setItem(
          `kybby_import_warnings:${payload.project.slug}`,
          payload.warnings.join('; '),
        )
      }
      navigate(payload.redirect_url.replace(/^\/app/, ''))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось импортировать проект.')
      setIsImporting(false)
    }
  }

  async function confirmDeleteProject() {
    if (!projectPendingDelete) return

    setError('')
    setIsDeletingProject(true)
    try {
      await deleteProject(projectPendingDelete.slug)
      setProjects((items) => items.filter((item) => item.slug !== projectPendingDelete.slug))
      setProjectPendingDelete(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить проект.')
    } finally {
      setIsDeletingProject(false)
    }
  }

  return (
    <section className="dashboard-content projects-dashboard">
      <div className="dashboard-head projects-head">
        <h1>Мои проекты</h1>
        <div className="projects-actions dashboard-head__actions">
          <div className="projects-primary-actions">
            <form className="dashboard-create-form projects-create-form" onSubmit={(event) => event.preventDefault()}>
              <input type="hidden" name="name" value="Новый проект" />
              <button type="button" className="btn btn-primary dashboard-create-btn projects-create-btn" disabled={isCreating || isImporting} onClick={handleCreateProject}>
                {isCreating ? 'Создаём...' : 'создать проект'}
              </button>
            </form>
            <button
              type="button"
              className="btn btn-outline dashboard-import-btn projects-import-btn"
              disabled={isCreating || isImporting}
              onClick={handleImportClick}
            >
              {isImporting ? 'Импортируем...' : 'импортировать проект'}
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".zip,application/zip"
              className="projects-import-input"
              hidden
              onChange={handleImportFileChange}
            />
          </div>
        </div>
      </div>

      {error ? <div className="form-alert form-alert--error">{error}</div> : null}

      {isLoading ? (
        <div className="dashboard-empty">
          <p>Загружаем проекты...</p>
        </div>
      ) : projects.length > 0 ? (
        <div className="project-grid projects-grid">
          {projects.map((project) => (
            <article className="project-card" key={project.slug}>
              <Link to={`/projects/${project.slug}/results`} className="project-card__main-link" aria-label={`Открыть результаты генерации ${project.name}`}></Link>
              <div className="project-card__body">
                <div className="project-card__title-row">
                  <div className="project-card__icon" aria-hidden="true">
                    <img
                      className="project-card__icon-img"
                      src="/app/static/img/landing/stars.png"
                      alt=""
                      width={28}
                      height={28}
                    />
                  </div>
                  <div className="project-card__heading">
                    <h2>{project.name}</h2>
                    <p>Дата создания:</p>
                    <span>{project.created_at.slice(0, 10)}</span>
                  </div>
                </div>
              </div>
              <div className="project-card__aside">
                {project.is_imported ? (
                  <div className="project-card__status">
                    <span className="project-card__badge" title="Проект импортирован из ZIP-архива">внешний</span>
                  </div>
                ) : null}
                <div className="project-card__actions">
                  <form className="project-card__delete-form" onSubmit={(event) => event.preventDefault()}>
                    <button
                      type="button"
                      className="project-card__action project-card__action--delete"
                      aria-label="Удалить проект"
                      onClick={() => setProjectPendingDelete(project)}
                    >
                      <ProjectCardDeleteIcon />
                    </button>
                  </form>
                  <Link to={`/projects/${project.slug}`} className="project-card__action project-card__action--edit" aria-label="Открыть редактор проекта">
                    <ProjectCardEditIcon />
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="dashboard-empty">
          <p>У вас пока нет проектов. Создайте первый проект и сразу перейдите к его редактированию.</p>
        </div>
      )}

      <AppConfirmModal
        open={projectPendingDelete !== null}
        message={projectPendingDelete ? `Удалить проект «${projectPendingDelete.name}»?` : ''}
        confirmLabel="Ок"
        cancelLabel="Отмена"
        isBusy={isDeletingProject}
        onConfirm={() => void confirmDeleteProject()}
        onCancel={() => {
          if (!isDeletingProject) setProjectPendingDelete(null)
        }}
      />
    </section>
  )
}
