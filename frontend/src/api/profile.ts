import { apiFetch, readJsonOrThrow } from './client';
import type { SessionUser } from '@/types/user';

type ProfileResponse = {
  ok: boolean;
  user: SessionUser;
};

export type ProfileUpdateInput = {
  name: string;
  currentPassword?: string;
  newPassword?: string;
  removeAvatar?: boolean;
  avatarFile?: File | null;
};

export async function fetchProfile(): Promise<SessionUser> {
  const res = await apiFetch('/api/profile');
  const data = await readJsonOrThrow<ProfileResponse>(res, 'Не удалось загрузить профиль.');
  return data.user;
}

export async function updateProfile(input: ProfileUpdateInput): Promise<SessionUser> {
  const formData = new FormData();
  formData.append('name', input.name);
  formData.append('current_password', input.currentPassword || '');
  formData.append('new_password', input.newPassword || '');
  formData.append('remove_avatar', input.removeAvatar ? '1' : '0');
  if (input.avatarFile) {
    formData.append('avatar', input.avatarFile);
  }

  const res = await apiFetch('/api/profile/update', {
    method: 'POST',
    body: formData,
  });
  const data = await readJsonOrThrow<ProfileResponse>(res, 'Не удалось обновить профиль.');
  return data.user;
}
