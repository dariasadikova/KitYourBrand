export const HELP_GUIDE_PENDING_KEY_PREFIX = 'kybby_pending_help_guide_'

export function helpGuidePendingStorageKey(userId: number): string {
  return `${HELP_GUIDE_PENDING_KEY_PREFIX}${userId}`
}

/** Показать инструкцию при следующем заходе на дашборд (после регистрации и первого входа). */
export function setPendingHelpGuide(userId: number): void {
  try {
    sessionStorage.setItem(helpGuidePendingStorageKey(userId), '1')
  } catch {
    /* storage unavailable */
  }
}

export function hasPendingHelpGuide(userId: number): boolean {
  try {
    return sessionStorage.getItem(helpGuidePendingStorageKey(userId)) === '1'
  } catch {
    return false
  }
}

export function clearPendingHelpGuide(userId: number): void {
  try {
    sessionStorage.removeItem(helpGuidePendingStorageKey(userId))
  } catch {
    /* storage unavailable */
  }
}
