import type { ProjectResultsResponse, ResultAsset } from '../../types/results'

export type MockupSlot = 'logo' | 'pattern' | 'illustration' | 'icon'

export type AssetKind = 'logos' | 'icons' | 'patterns' | 'illustrations'

export type MockupSelection = Record<MockupSlot, string>

export const MOCKUP_SLOTS: { key: MockupSlot; label: string; kind: AssetKind }[] = [
  { key: 'logo', label: 'Логотип', kind: 'logos' },
  { key: 'pattern', label: 'Паттерн', kind: 'patterns' },
  { key: 'illustration', label: 'Иллюстрация', kind: 'illustrations' },
  { key: 'icon', label: 'Иконка', kind: 'icons' },
]

export function assetsForProvider(assets: ResultAsset[], provider: string): ResultAsset[] {
  return assets.filter((asset) => asset.provider === provider)
}

export function defaultMockupSelection(results: ProjectResultsResponse, provider: string): MockupSelection {
  const pick = (kind: AssetKind) => assetsForProvider(results.assets[kind], provider)[0]?.url || ''
  return {
    logo: pick('logos'),
    pattern: pick('patterns'),
    illustration: pick('illustrations'),
    icon: pick('icons'),
  }
}

export function availableUrlsForSlot(results: ProjectResultsResponse, provider: string, slot: MockupSlot): string[] {
  const kind = MOCKUP_SLOTS.find((item) => item.key === slot)?.kind
  if (!kind) return []
  return assetsForProvider(results.assets[kind], provider).map((asset) => asset.url)
}

export function normalizeMockupSelection(
  results: ProjectResultsResponse,
  provider: string,
  selection: Partial<MockupSelection> | null | undefined,
): MockupSelection {
  const defaults = defaultMockupSelection(results, provider)
  const next = { ...defaults }

  for (const slot of MOCKUP_SLOTS) {
    const allowed = new Set(availableUrlsForSlot(results, provider, slot.key))
    const candidate = selection?.[slot.key]
    if (candidate && allowed.has(candidate)) {
      next[slot.key] = candidate
    }
  }

  return next
}

export function mockupSelectionStorageKey(
  projectSlug: string,
  provider: string,
  jobId?: string,
): string {
  const job = jobId?.trim() || 'latest'
  return `kybby-mockup-selection:${projectSlug}:${job}:${provider}`
}

export function loadMockupSelection(storageKey: string): Partial<MockupSelection> | null {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<MockupSelection>
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export function saveMockupSelection(storageKey: string, selection: MockupSelection): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(selection))
  } catch {
    // ignore quota / private mode
  }
}
