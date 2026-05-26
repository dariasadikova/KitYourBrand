import { GENERATION_PROVIDERS } from '../constants/generationProviders'
import type { ProjectTokens } from '../types/editor'

export const PALETTE_KEYS = ['primary', 'secondary', 'accent', 'tertiary', 'neutral', 'extra'] as const
export type PaletteKey = (typeof PALETTE_KEYS)[number]

export const PALETTE_LABELS: Record<PaletteKey, string> = {
  primary: 'Primary',
  secondary: 'Secondary',
  accent: 'Accent',
  tertiary: 'Tertiary',
  neutral: 'Neutral',
  extra: 'Extra',
}

export const DEFAULT_PALETTE: Record<PaletteKey, string> = {
  primary: '#E5A50A',
  secondary: '#C64600',
  accent: '#613583',
  tertiary: '#5E81AC',
  neutral: '#D8DEE9',
  extra: '#2E3440',
}

export const ASSET_TYPES = ['logos', 'icons', 'patterns', 'illustrations'] as const
export type AssetType = (typeof ASSET_TYPES)[number]

export type StyleRef = {
  path: string
  name: string
  url: string
}

export const ASSET_LABELS: Record<AssetType, string> = {
  logos: 'Логотип',
  icons: 'Иконки',
  patterns: 'Паттерны',
  illustrations: 'Иллюстрации',
}

export const ASSET_PLACEHOLDERS: Record<AssetType, string> = {
  logos: 'Опишите, какой логотип вам нужен…',
  icons: 'Опишите, какие иконки или образы ожидаете…',
  patterns: 'Опишите, каким должен быть паттерн…',
  illustrations: 'Опишите, какую иллюстрацию хотите получить…',
}

export const ASSET_REF_LABELS: Record<AssetType, string> = {
  logos: 'Референсы для логотипа',
  icons: 'Референсы для иконок',
  patterns: 'Референсы для паттернов',
  illustrations: 'Референсы для иллюстраций',
}

export const DEFAULT_ASSET_COUNTS: Record<AssetType, number> = {
  logos: 4,
  icons: 8,
  patterns: 4,
  illustrations: 4,
}

export function getTokenRecord(tokens: ProjectTokens, key: string): Record<string, unknown> {
  const value = tokens[key]
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function getTokenString(tokens: ProjectTokens, key: string): string {
  const value = tokens[key]
  return typeof value === 'string' ? value : ''
}

export function getNestedTokenString(tokens: ProjectTokens, group: string, key: string, fallback: string): string {
  const record = getTokenRecord(tokens, group)
  const value = record[key]
  return typeof value === 'string' ? value : fallback
}

export function getNestedTokenNumber(tokens: ProjectTokens, group: string, key: string, fallback: number): number {
  const record = getTokenRecord(tokens, group)
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function getNestedTokenBoolean(tokens: ProjectTokens, group: string, key: string, fallback: boolean): boolean {
  const record = getTokenRecord(tokens, group)
  const value = record[key]
  return typeof value === 'boolean' ? value : fallback
}

export function getNestedTokenArray(tokens: ProjectTokens, group: string, key: string): unknown[] {
  const record = getTokenRecord(tokens, group)
  const value = record[key]
  return Array.isArray(value) ? value : []
}

const ALL_GENERATION_PROVIDER_SLUGS = GENERATION_PROVIDERS.map((p) => p.slug)

export function getGenerationProviderSlugsFromTokens(tokens: ProjectTokens): string[] {
  const raw = getNestedTokenArray(tokens, 'generation', 'provider_slugs')
  const allowed = new Set<string>(ALL_GENERATION_PROVIDER_SLUGS)
  const picked: string[] = []
  for (const item of raw) {
    const s = String(item).trim()
    if (allowed.has(s) && !picked.includes(s)) {
      picked.push(s)
    }
  }
  if (picked.length) {
    return picked
  }
  return [...ALL_GENERATION_PROVIDER_SLUGS]
}

export function getPaletteSlots(tokens: ProjectTokens): Record<PaletteKey, string> {
  const paletteSlots = getTokenRecord(tokens, 'palette_slots')
  const palette = getTokenRecord(tokens, 'palette')

  return PALETTE_KEYS.reduce<Record<PaletteKey, string>>((acc, key) => {
    const raw = paletteSlots[key] || palette[key]
    acc[key] = typeof raw === 'string' ? raw.toUpperCase() : DEFAULT_PALETTE[key]
    return acc
  }, { ...DEFAULT_PALETTE })
}

export function getActivePaletteKeys(tokens: ProjectTokens): PaletteKey[] {
  const generation = getTokenRecord(tokens, 'generation')
  const raw = generation.active_palette_keys
  if (!Array.isArray(raw)) return ['primary', 'secondary', 'accent']
  const normalized = raw.filter((key): key is PaletteKey => typeof key === 'string' && PALETTE_KEYS.includes(key as PaletteKey))
  return normalized.length >= 2 ? normalized.slice(0, 6) : ['primary', 'secondary', 'accent']
}

export function tokensToPromptFields(tokens: ProjectTokens): Record<AssetType, string> {
  const prompts = getTokenRecord(tokens, 'prompts')
  return ASSET_TYPES.reduce<Record<AssetType, string>>((acc, type) => {
    acc[type] = promptArrayToSingleFieldText(prompts[type])
    return acc
  }, { logos: '', icons: '', patterns: '', illustrations: '' })
}

/** Один текст в форме — в tokens повторяется по числу вариантов (ожидание CLI). */
export function expandPromptFieldForCount(text: string, count: number): string[] {
  const trimmed = text.trim()
  if (!trimmed || count <= 0) return []
  return Array.from({ length: count }, () => trimmed)
}

export function promptArrayToSingleFieldText(raw: unknown): string {
  const arr = normalizePromptArray(raw)
  if (!arr.length) return ''
  if (arr.every((item) => item === arr[0])) return arr[0]
  return arr.join('\n')
}

export function getAssetCounts(tokens: ProjectTokens): Record<AssetType, number> {
  const generation = getTokenRecord(tokens, 'generation')
  return ASSET_TYPES.reduce<Record<AssetType, number>>((acc, type) => {
    acc[type] = clampAssetCount(generation[`${type}_count`], DEFAULT_ASSET_COUNTS[type])
    return acc
  }, { ...DEFAULT_ASSET_COUNTS })
}

export function normalizePromptArray(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item).trim()).filter(Boolean)
  }
  if (typeof raw === 'string') {
    return raw.split(/[,;\n]+/).map((item) => item.trim()).filter(Boolean)
  }
  return []
}

export function clampAssetCount(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value || ''), 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(1, Math.min(20, parsed))
}

export function assetCountLabel(type: AssetType): string {
  if (type === 'logos') return 'Количество вариантов логотипа'
  if (type === 'icons') return 'Количество иконок'
  if (type === 'patterns') return 'Количество паттернов'
  return 'Количество иллюстраций'
}

export function normalizeStyleRefs(raw: unknown, projectSlug: string): StyleRef[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      const path = typeof item === 'string'
        ? item
        : item && typeof item === 'object' && 'path' in item && typeof item.path === 'string'
          ? item.path
          : ''
      if (!path) return null
      const name = path.split('/').pop() || 'ref'
      const url = item && typeof item === 'object' && 'url' in item && typeof item.url === 'string'
        ? item.url
        : `/projects/${projectSlug}/refs/${encodeURIComponent(name)}`
      return { path, name, url }
    })
    .filter((item): item is StyleRef => Boolean(item))
}

export function referencesToAssetRefs(tokens: ProjectTokens, projectSlug: string): Record<AssetType, StyleRef[]> {
  const perType = ASSET_TYPES.reduce<Record<AssetType, StyleRef[]>>((acc, type) => {
    acc[type] = normalizeStyleRefs(getNestedTokenArray(tokens, 'references', type), projectSlug)
    return acc
  }, {
    logos: [],
    icons: [],
    patterns: [],
    illustrations: [],
  })
  const hasPerType = ASSET_TYPES.some((type) => perType[type].length > 0)
  const legacy = normalizeStyleRefs(getNestedTokenArray(tokens, 'references', 'style_images'), projectSlug)
  if (!hasPerType && legacy.length) {
    return ASSET_TYPES.reduce<Record<AssetType, StyleRef[]>>((acc, type) => {
      acc[type] = legacy
      return acc
    }, {
      logos: [],
      icons: [],
      patterns: [],
      illustrations: [],
    })
  }
  return perType
}

export function capitalizePaletteLabel(key: PaletteKey): string {
  return PALETTE_LABELS[key] || key[0].toUpperCase() + key.slice(1)
}

export function normalizeHexColor(value: string): string {
  const trimmed = value.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toUpperCase()
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
    return `#${trimmed.slice(1).split('').map((char) => char + char).join('')}`.toUpperCase()
  }
  return ''
}

export function illustrationFormatFromTokens(tokens: ProjectTokens): 'vector' | 'raster' {
  const vector = getNestedTokenBoolean(tokens, 'illustration', 'vector', false)
  const raster = getNestedTokenBoolean(tokens, 'illustration', 'raster', true)
  if (vector && !raster) return 'vector'
  return 'raster'
}
