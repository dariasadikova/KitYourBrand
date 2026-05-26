import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { GenerationHistoryResponse } from '../types/generationHistory'
import type { ProjectResultsResponse } from '../types/results'
import { GenerationHistoryPage, ResultsPage } from './AppPages'
import { deleteGenerationHistorySelected, getGenerationHistory } from '../services/generationHistoryApi'
import { generateFigmaManifest, getActiveGenerationJob, getProjectResults } from '../services/resultsApi'

vi.mock('../services/generationHistoryApi', () => ({
  cancelGenerationJob: vi.fn(),
  deleteGenerationHistorySelected: vi.fn(),
  getGenerationHistory: vi.fn(),
}))

vi.mock('../services/projectsApi', () => ({
  createProject: vi.fn(),
  deleteProject: vi.fn(),
  importProjectBundle: vi.fn(),
  listProjects: vi.fn(),
  restoreProject: vi.fn(),
}))

vi.mock('../services/editorApi', () => ({
  deleteProjectEditorRef: vi.fn(),
  getProjectEditor: vi.fn(),
  resetProjectEditor: vi.fn(),
  saveProjectEditor: vi.fn(),
  startProjectGeneration: vi.fn(),
  suggestProjectPalette: vi.fn(),
  uploadProjectEditorRefs: vi.fn(),
}))

vi.mock('../services/resultsApi', () => ({
  cancelGenerationJob: vi.fn(),
  generateFigmaManifest: vi.fn(),
  getActiveGenerationJob: vi.fn(),
  getGenerationJob: vi.fn(),
  getProjectResults: vi.fn(),
}))

vi.mock('../components/mockups/BrandMockupsPreview', () => ({
  BrandMockupsPreview: () => <div data-testid="mockups-preview">Mockups preview</div>,
}))

const getGenerationHistoryMock = vi.mocked(getGenerationHistory)
const deleteGenerationHistorySelectedMock = vi.mocked(deleteGenerationHistorySelected)
const getProjectResultsMock = vi.mocked(getProjectResults)
const getActiveGenerationJobMock = vi.mocked(getActiveGenerationJob)
const generateFigmaManifestMock = vi.mocked(generateFigmaManifest)

function historyPayload(): GenerationHistoryResponse {
  return {
    ok: true,
    rows: [
      {
        job_id: 'job-1',
        started_display: '2026-05-26 18:00',
        project_name: 'NOVA',
        project_slug: 'nova',
        status_key: 'success',
        duration_display: '9 мин',
        action: 'open',
        results_url: '/app/projects/nova/results?job=job-1',
        editor_url: '/app/projects/nova',
        error_message: '',
        error_hint: '',
        interrupted: false,
      },
    ],
    stats: { total: 1, successful: 1, avg_duration: 540, projects_with_generations: 1 },
    stats_avg_display: '9 мин',
    page: 1,
    per_page: 20,
    total: 1,
    total_pages: 1,
    has_prev: false,
    has_next: false,
    prev_page: 1,
    next_page: 1,
    showing_from: 1,
    showing_to: 1,
  }
}

function emptyResultsPayload(): ProjectResultsResponse {
  return {
    ok: true,
    project: { slug: 'nova', name: 'NOVA', brand_id: 'nova-brand', brand_description: 'Smart home brand' },
    palette_items: [],
    assets: { logos: [], icons: [], patterns: [], illustrations: [] },
    active_generation_job_id: '',
    selected_generation_job_id: '',
  }
}

function generatedResultsPayload(): ProjectResultsResponse {
  return {
    ...emptyResultsPayload(),
    palette_items: [{ key: 'primary', label: 'Primary', value: '#00AEFF' }],
    assets: {
      logos: [{ provider: 'recraft', name: 'Logo', filename: 'logo.png', url: '/logo.png' }],
      icons: [],
      patterns: [],
      illustrations: [],
    },
  }
}

describe('GenerationHistoryPage', () => {
  beforeEach(() => {
    getGenerationHistoryMock.mockReset()
    deleteGenerationHistorySelectedMock.mockReset()
  })

  it('loads generation history and deletes selected rows through the styled confirm modal', async () => {
    getGenerationHistoryMock.mockResolvedValue(historyPayload())
    deleteGenerationHistorySelectedMock.mockResolvedValue({ ok: true, deleted: 1, skipped: 0 })
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <GenerationHistoryPage />
      </MemoryRouter>,
    )

    expect(await screen.findByText('NOVA')).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: '' }))
    await user.click(screen.getByRole('button', { name: 'Удалить' }))

    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('Удалить выбранные записи (1) из истории генераций?')
    await user.click(within(dialog).getByRole('button', { name: 'Ок' }))

    await waitFor(() => {
      expect(deleteGenerationHistorySelectedMock).toHaveBeenCalledWith(['job-1'])
      expect(getGenerationHistoryMock).toHaveBeenCalledTimes(2)
    })
  })
})

describe('ResultsPage', () => {
  beforeEach(() => {
    getProjectResultsMock.mockReset()
    getActiveGenerationJobMock.mockReset()
    generateFigmaManifestMock.mockReset()
    getActiveGenerationJobMock.mockResolvedValue({ ok: true, job: null })
  })

  it('renders the empty results state from mocked API data', async () => {
    getProjectResultsMock.mockResolvedValue(emptyResultsPayload())

    render(
      <MemoryRouter>
        <ResultsPage projectSlug="nova" />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Здесь появятся результаты после первой успешной генерации в редакторе проекта.')).toBeInTheDocument()
    expect(screen.getByText('Палитра пока недоступна.')).toBeInTheDocument()
    expect(getProjectResultsMock).toHaveBeenCalledWith('nova', '')
  })

  it('exports a Figma manifest and shows the download link when results exist', async () => {
    getProjectResultsMock.mockResolvedValue(generatedResultsPayload())
    generateFigmaManifestMock.mockResolvedValue({
      ok: true,
      brand_id: 'nova-brand',
      counts: {},
      manifest_url: '/manifest.json',
      download_url: '/download/manifest.json',
      production_url: '',
      local_url: '',
    })
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <ResultsPage projectSlug="nova" />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Ваш бренд-комплект готов к использованию.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'экспорт бренд-комплекта' }))

    expect(await screen.findByText('Экспорт готов. Скопируйте Brand ID и импортируйте проект через плагин Figma.')).toBeInTheDocument()
    expect(screen.getByText('Скачать JSON manifest')).toBeInTheDocument()
    expect(generateFigmaManifestMock).toHaveBeenCalledWith('nova', 'nova-brand', undefined)
  })
})
