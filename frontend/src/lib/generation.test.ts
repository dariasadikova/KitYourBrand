import { describe, expect, it } from 'vitest'

import {
  activeProviderSlug,
  generationProviderEntries,
  isGenerationLogErrorLine,
  normalizeProviderStatus,
  providerLabel,
  providerStatusLabel,
} from './generation'

describe('generation helpers', () => {
  it('uses configured provider labels and formats unknown provider slugs', () => {
    expect(providerLabel('recraft')).toBe('Recraft')
    expect(providerLabel('custom_provider')).toBe('Custom Provider')
  })

  it('keeps known providers first and appends unknown provider statuses', () => {
    const entries = generationProviderEntries({ custom_provider: 'running' })

    expect(entries.slice(0, 2)).toEqual([
      { slug: 'recraft', label: 'Recraft' },
      { slug: 'seedream', label: 'Seedream' },
    ])
    expect(entries.at(-1)).toEqual({ slug: 'custom_provider', label: 'Custom Provider' })
  })

  it('normalizes provider statuses and exposes Russian labels', () => {
    expect(normalizeProviderStatus('success')).toBe('success')
    expect(normalizeProviderStatus('unexpected')).toBe('pending')
    expect(providerStatusLabel('running')).toBe('выполняется')
    expect(providerStatusLabel('error')).toBe('ошибка')
    expect(providerStatusLabel(undefined)).toBe('ожидание')
  })

  it('selects the currently running provider or the next pending provider', () => {
    expect(activeProviderSlug({ recraft: 'success', seedream: 'running' })).toBe('seedream')
    expect(activeProviderSlug({ recraft: 'success', seedream: 'success' })).toBe('flux')
  })

  it('detects error-like generation log lines in English and Russian', () => {
    expect(isGenerationLogErrorLine('[12:00] HTTP 429: rate limit')).toBe(true)
    expect(isGenerationLogErrorLine('Не удалось получить ответ от провайдера')).toBe(true)
    expect(isGenerationLogErrorLine('[12:00] Provider completed successfully')).toBe(false)
  })
})
