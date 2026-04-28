/**
 * Базовый URL классического (Jinja) приложения.
 * В dev Vite и FastAPI на разных портах — по умолчанию backend :8000 (как в proxy).
 * В production при общем origin можно задать пустую строку через env или оставить относительные пути.
 */
export function getLegacyAppOrigin(): string {
  const fromEnv = import.meta.env.VITE_LEGACY_APP_ORIGIN;
  if (typeof fromEnv === 'string' && fromEnv.trim()) {
    return fromEnv.trim().replace(/\/$/, '');
  }
  if (import.meta.env.DEV) {
    if (typeof window !== 'undefined' && window.location?.hostname) {
      const { protocol, hostname } = window.location;
      return `${protocol}//${hostname}:8000`;
    }
    return 'http://127.0.0.1:8000';
  }
  return '';
}

export function legacyProjectEditorUrl(slug: string): string {
  const base = getLegacyAppOrigin();
  const path = `/projects/${encodeURIComponent(slug)}`;
  return base ? `${base}${path}` : path;
}

export function legacyProjectResultsUrl(slug: string): string {
  const base = getLegacyAppOrigin();
  const path = `/projects/${encodeURIComponent(slug)}/results`;
  return base ? `${base}${path}` : path;
}

export function legacyDashboardUrl(): string {
  const base = getLegacyAppOrigin();
  const path = '/dashboard';
  return base ? `${base}${path}` : path;
}
