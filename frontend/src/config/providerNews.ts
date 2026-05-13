/** Увеличивайте при появлении новых провайдеров — у пользователей снова покажется голубой индикатор. */
export const PROVIDER_NEWS_VERSION = 1

export const PROVIDER_NEWS_STORAGE_KEY_PREFIX = 'kybby_seen_provider_news_v'

export function providerNewsStorageKey(userId: number): string {
  return `${PROVIDER_NEWS_STORAGE_KEY_PREFIX}_${userId}`
}

export function readSeenProviderNewsVersion(userId: number): number {
  try {
    return parseInt(localStorage.getItem(providerNewsStorageKey(userId)) || '0', 10) || 0
  } catch {
    return 0
  }
}

export type ProviderNewsEntry = {
  title: string
  body: string
}

/** Тексты уведомлений в порядке от старых к новым (актуальный блок — последний). */
export const PROVIDER_NEWS_ENTRIES: ProviderNewsEntry[] = [
  {
    title: 'Новые нейросети',
    body: 'К генерации бренд-комплекта подключены Nano Banana и GPT-5 Image Mini (OpenRouter). Они дополняют Recraft, Seedream и Flux.',
  },
]
