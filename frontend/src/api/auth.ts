import { apiFetch, readJsonOrThrow } from './client';
import type { SessionUser } from '@/types/user';

type MeResponse = { ok: boolean; user?: SessionUser; error?: string };
type LoginResponse = { ok: boolean; user?: SessionUser; error?: string };
type LogoutResponse = { ok: boolean };
type RegisterResponse = { ok: boolean; message?: string; error?: string };

export async function fetchMe(): Promise<SessionUser | null> {
  const res = await apiFetch('/api/auth/me');
  if (res.status === 401) {
    return null;
  }
  const data = await readJsonOrThrow<MeResponse>(res, 'Не удалось получить профиль.');
  return data.user ?? null;
}

export async function login(email: string, password: string): Promise<SessionUser> {
  const res = await apiFetch('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  const data = await readJsonOrThrow<LoginResponse>(res, 'Ошибка входа.');
  if (!data.user) {
    throw new Error('Ответ сервера не содержит пользователя.');
  }
  return data.user;
}

export async function register(
  name: string,
  email: string,
  password: string,
  password_confirm: string,
): Promise<void> {
  const res = await apiFetch('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ name, email, password, password_confirm }),
  });
  await readJsonOrThrow<RegisterResponse>(res, 'Ошибка регистрации.');
}

export async function logout(): Promise<void> {
  const res = await apiFetch('/api/auth/logout', { method: 'POST' });
  await readJsonOrThrow<LogoutResponse>(res, 'Ошибка выхода.');
}
