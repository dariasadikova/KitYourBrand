import { GENERATION_PROVIDERS } from '../constants/generationProviders'

export function providerLabel(provider: string): string {
  return GENERATION_PROVIDERS.find((item) => item.slug === provider)?.label
    || provider.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase())
}

export function generationProviderEntries(statuses: Record<string, string | undefined>) {
  const known = GENERATION_PROVIDERS.map((provider) => provider.slug)
  const extra = Object.keys(statuses || {}).filter((provider) => !known.includes(provider as typeof known[number]))
  return [...known, ...extra].map((provider) => ({ slug: provider, label: providerLabel(provider) }))
}

export function isGenerationLogErrorLine(line: string): boolean {
  const withoutTime = line.replace(/^\[[^\]]+\]\s*/, '').trim()
  const s = withoutTime.toLowerCase()
  if (!s) return false
  const markers = [
    'insufficient credits',
    'insufficient balance',
    'out of credits',
    'payment required',
    'billing',
    'rate limit',
    'too many requests',
    'quota exceeded',
    'error',
    'err:',
    '[err]',
    'stderr',
    'error:',
    '[error]',
    ' failed',
    'failed:',
    'failure',
    'exception',
    'traceback',
    'http 401',
    'http 403',
    'http 429',
    'http 500',
    'http 502',
    'http 503',
    'econnrefused',
    'etimedout',
    'timeout',
    'unauthorized',
    'forbidden',
    'invalid api key',
    'api key invalid',
    'openrouter.ai',
    'ошибка',
    'сбой',
    'подсказка:',
    'не удалось',
    'недостаточно средств',
    'недостаточно',
    'отказано',
    'превышено время',
    'недоступен',
    'завершена с ошибками',
  ]
  return markers.some((m) => s.includes(m))
}

export function normalizeProviderStatus(status: string | undefined): string {
  const normalized = String(status || '')
  return ['pending', 'running', 'success', 'error', 'skipped'].includes(normalized) ? normalized : 'pending'
}

export function providerStatusLabel(status: string | undefined) {
  const normalized = normalizeProviderStatus(status)
  if (normalized === 'running') return 'выполняется'
  if (normalized === 'success') return 'успех'
  if (normalized === 'error') return 'ошибка'
  if (normalized === 'skipped') return 'пропущен'
  return 'ожидание'
}

export function activeProviderSlug(statuses: Record<string, string | undefined>) {
  const entries = generationProviderEntries(statuses)
  const running = entries.find((provider) => normalizeProviderStatus(statuses[provider.slug]) === 'running')
  if (running) return running.slug

  const lastResolvedIndex = entries.reduce((lastIndex, provider, index) => {
    const status = normalizeProviderStatus(statuses[provider.slug])
    return status === 'success' || status === 'error' || status === 'skipped' ? index : lastIndex
  }, -1)
  const nextPending = entries.slice(lastResolvedIndex + 1).find((provider) => normalizeProviderStatus(statuses[provider.slug]) === 'pending')
  return nextPending?.slug || entries[Math.max(0, lastResolvedIndex)]?.slug || entries[0]?.slug || ''
}
