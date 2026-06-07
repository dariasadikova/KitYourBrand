/** Увеличивайте при появлении новых провайдеров — у пользователей снова покажется голубой индикатор. */
export const PROVIDER_NEWS_VERSION = 2

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

/** Актуальное уведомление. При смене текста увеличивайте PROVIDER_NEWS_VERSION — предыдущее сообщение заменяется. */
export const PROVIDER_NEWS_CURRENT: ProviderNewsEntry = {
  title: 'Новые нейросети',
  body: 'К генерации бренд-комплекта подключена Alice AI ART (Yandex Cloud AI Studio). Она дополняет Recraft, Seedream, Flux, Nano Banana и GPT-5 Image Mini.',
}
