export type ApiErrorBody = {
  ok?: boolean;
  error?: string;
  detail?: string | { msg: string }[];
};

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
  return fetch(path, {
    ...init,
    headers,
    credentials: 'include',
  });
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
