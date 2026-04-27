export type ApiErrorBody = {
  ok?: boolean;
  error?: string;
  detail?: string | { msg: string }[];
};

const AUTH_401_NO_REDIRECT = new Set([
  '/api/auth/me',
  '/api/auth/login',
  '/api/auth/register',
]);

function requestPathOnly(path: string): string {
  try {
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return new URL(path).pathname;
    }
  } catch {
    /* ignore */
  }
  const q = path.indexOf('?');
  return q === -1 ? path : path.slice(0, q);
}

function shouldRedirectUnauthorizedApi(path: string): boolean {
  const pathname = requestPathOnly(path);
  if (!pathname.startsWith('/api/')) {
    return false;
  }
  return !AUTH_401_NO_REDIRECT.has(pathname);
}

function redirectToLogin(): void {
  if (typeof window === 'undefined') {
    return;
  }
  const { pathname, search, hash } = window.location;
  if (pathname === '/login' || pathname === '/register') {
    return;
  }
  window.location.replace(`/login${search}${hash}`);
}

async function parseJsonSafe(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(path, {
    ...init,
    headers,
    credentials: 'include',
  });
  if (res.status === 401 && shouldRedirectUnauthorizedApi(path)) {
    redirectToLogin();
  }
  return res;
}

export function getErrorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== 'object') {
    return fallback;
  }
  const body = data as ApiErrorBody;
  if (typeof body.error === 'string' && body.error.trim()) {
    return body.error;
  }
  if (typeof body.detail === 'string' && body.detail.trim()) {
    return body.detail;
  }
  if (Array.isArray(body.detail)) {
    const first = body.detail[0];
    if (first && typeof first === 'object' && 'msg' in first && typeof first.msg === 'string') {
      return first.msg;
    }
  }
  return fallback;
}

export async function readJsonOrThrow<T>(res: Response, fallbackError: string): Promise<T> {
  const data = (await parseJsonSafe(res)) as T | ApiErrorBody | null;
  if (!res.ok) {
    throw new Error(getErrorMessage(data, fallbackError));
  }
  return data as T;
}
